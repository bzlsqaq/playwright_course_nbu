import {AIService, PageTools, RegisterPage} from "./CreepBase";
import {expect, Locator, Page, test} from "@playwright/test";
import {readFile, writeFile} from "node:fs/promises";

test('politics_creep', async () => {
        test.setTimeout(1000 * 60 * 60 * 24)
        const aiService = new AIService()
        await aiService.ocrInit()
        const registerPage = new RegisterPage('bzls','./data/data_politics/')
        const page = await registerPage.getStartPage('https://nbuyjs.yuketang.cn/pro/lms/CSs3mnBmJ7Y/28403852/studycontent')
        const mainManager = new PageTools(page, '.chapter-list>.content>div:last-child')//ul元素
        // await page.waitForTimeout(100000)
        let keywords: string;
        let elemLocator: Locator | undefined
        do {
            elemLocator = await mainManager.getFirstElem()
            if (elemLocator == undefined) {
                break;
            }
            const keywords = (await elemLocator.locator('>div:first-child').innerText()).trim()

            const newPagePromise = page.context().waitForEvent('page', {timeout: 10000});
            await elemLocator.click()
            const newPage: Page = await newPagePromise;
            const deputyManager = new PageTools(newPage, '.pt10>li')//li元素

            let keywords2: string;
            let elem2Locator: Locator | undefined
            do {
                elem2Locator = await deputyManager.getFirstElem()


                if (elem2Locator == undefined) {
                    break
                }
                keywords2 = (await elem2Locator.innerText()).trim()
                await elem2Locator.click()

                await deputyManager.action(async () => {
                    await processQuestionAndSave(
                        newPage,
                        keywords2,
                        aiService,
                        `./data/data_politics/course/${keywords}.json` // 你的存储路径
                    );

                })

            } while (await deputyManager.elemFinished(elem2Locator))


        } while (await mainManager.elemFinished(elemLocator))

    }
)


/**
 * 核心处理逻辑：解析单个题目(li)并写入JSON
 * @param liElem 当前题目的 Locator (即 elem2Locator)
 * @param aiService 你的 AI 服务实例
 * @param jsonPath JSON 文件保存路径
 */
/**
 * 核心处理逻辑：解析主视图中的题目并写入JSON
 * @param page 当前页面的 Page 对象
 * @param expectedTitle 从列表(li)获取的标题（如 "48.多选题"），用于校验页面是否刷新成功
 * @param aiService 你的 AI 服务实例
 * @param jsonPath JSON 文件保存路径
 */
async function processQuestionAndSave(page: Page, expectedTitle: string, aiService: AIService, jsonPath: string) {
    const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    // --- 1. 同步校验 (保持不变) ---
    const typeLocator = page.locator('.subject-item > .item-type').first();
    const expectedId = expectedTitle.split('.')[0].trim();

    try {
        await typeLocator.waitFor({state: 'visible', timeout: 5000});
        await expect(typeLocator).toContainText(expectedId, {timeout: 5000});
    } catch (e) {
        console.warn(`⚠️ ID校验超时: 期望 ${expectedId}`);
    }

    const typeText = await typeLocator.innerText();
    const [idStr, typeStr] = typeText.split('.');
    const questionId = idStr.trim();
    const isJudge = typeStr.includes('判断');

    let questionData: any = {};

    // --- 2. 核心分支逻辑 ---

    // 优先尝试获取 Old Logic 的特征元素
    const ueditorLocators = await page.locator('.subject-item  .custom_ueditor_cn_body').all();

    if (ueditorLocators.length > 0) {
        // ==========================================
        // 分支 A：旧逻辑 (存在 custom_ueditor_cn_body)
        // ==========================================
        console.log(`[${questionId}] 检测到 ueditor 元素，使用【旧逻辑】`);

        // 索引 0 是题干
        questionData['name'] = await aiService.ocrLocator(ueditorLocators[0]);

        // 索引 1+ 是选项 (非判断题)
        if (!isJudge) {
            for (let i = 1; i < ueditorLocators.length; i++) {
                if (i - 1 < OPTION_KEYS.length) {
                    questionData[OPTION_KEYS[i - 1]] = await aiService.ocrLocator(ueditorLocators[i]);
                }
            }
        } else {
            questionData['type'] = '判断题';
        }

    } else {
        // ==========================================
        // 分支 B：新逻辑 (没有 custom_ueditor_cn_body)
        // ==========================================
        console.log(`[${questionId}] 未检测到 ueditor 元素，使用【新逻辑】`);

        // 1. 抓取题干 (使用您指定的新选择器)
        const problemBodyLocator = page.locator('.subject-item  .problem-body').first();

        // 双重保险：确保元素存在
        if (await problemBodyLocator.count() > 0) {
            questionData['name'] = await aiService.ocrLocator(problemBodyLocator);
        } else {
            console.error(`[${questionId}] 严重错误：既没有 ueditor 也没有 problem-body`);
            return; // 无法继续
        }

        // 2. 抓取选项 (非判断题)
        if (!isJudge) {
            // 新逻辑的选项是 .el-radio__label
            let radioLabels = await page.locator('.subject-item .radioText').all();
            if (radioLabels.length == 0) {
                radioLabels = await page.locator('.item-body .checkboxText').all()
            }
            for (let i = 0; i < radioLabels.length; i++) {
                if (i < OPTION_KEYS.length) {
                    // 新逻辑索引从 0 开始 (0=A, 1=B)
                    questionData[OPTION_KEYS[i]] = await aiService.ocrLocator(radioLabels[i]);
                }
            }
        } else {
            questionData['type'] = '判断题';
        }
    }

    // --- 3. 提取答案 (通用) ---
    const answerLocator = page.locator('.problem-remark > div:last-child').first();
    if (await answerLocator.count() > 0) {
        questionData['answer'] = await aiService.ocrLocator(answerLocator);
    } else {
        questionData['answer'] = "未找到答案";
    }

    // --- 4. 写入 ---
    await appendToJson(jsonPath, questionId, questionData);
    console.log(`✅ [${questionId}] 保存完成`);
}

// 辅助函数：安全写入 JSON
async function appendToJson(filePath: string, key: string, value: any) {
    let currentData = {};
    try {
        // 尝试读取现有文件
        const fileContent = await readFile(filePath, 'utf-8');
        currentData = JSON.parse(fileContent);
    } catch (e) {
        // 文件不存在或格式错误，从空对象开始
    }

    // 更新数据
    currentData[key] = value;

    // 写入文件
    await writeFile(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
}

