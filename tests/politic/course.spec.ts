import {Browser, BrowserContext, chromium, expect, Page, test} from '@playwright/test';
import {OCRService} from "./OCRService";
import {callAIResponse} from "./AIService"
import {appendToJson} from "./appendToJson";
import * as fs from "fs";
//填写对应的页面链接

const politicUserConfigs = {
    writer: {
        userName: 'bzls',
        shouldWriteExercise: true,
        enabled: true
    },
    member1: {
        userName: 'peng',
        shouldWriteExercise: false,
        enabled: false
    },
    member2: {
        userName: 'cheng',
        shouldWriteExercise: false,
        enabled: false
    }
};

const activePoliticUsers = Object.entries(politicUserConfigs)
    .filter(([, config]) => config.enabled);

const writePlaybackLog = (logFile: string, message: string) => {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    console.log(line.trim());
    try {
        fs.appendFileSync(logFile, line, "utf8");
    } catch (e) {
        console.log("写入播放日志失败：", e.message);
    }
};

const getCourseSignature = async (page: Page) => {
    const title = await page.locator('.current_play .catalog_name, .videoCurrent, .catalog_name.active, .courseName.active')
        .first()
        .innerText()
        .catch(() => '');
    const video = page.locator('video').first();
    const currentTime = await video.evaluate(v => Number((v as HTMLVideoElement).currentTime || 0)).catch(() => -1);
    const paused = await video.evaluate(v => (v as HTMLVideoElement).paused).catch(() => true);
    return `${title.trim()}|${currentTime}|${paused}`;
};

const getVideoPlaybackState = async (page: Page) => {
    const video = page.locator('video').first();
    const hasVideo = await video.isVisible().catch(() => false);
    if (!hasVideo) {
        return {
            hasVideo: false,
            paused: true,
            ended: false,
            currentTime: -1,
            duration: -1,
            nearEnd: false
        };
    }

    const state = await video.evaluate(v => {
        const el = v as HTMLVideoElement;
        return {
            paused: el.paused,
            ended: el.ended,
            currentTime: Number(el.currentTime || 0),
            duration: Number(el.duration || 0)
        };
    }).catch(() => ({
        paused: true,
        ended: false,
        currentTime: -1,
        duration: -1
    }));

    return {
        hasVideo: true,
        ...state,
        nearEnd: false
    };
};

const applyPreferredVideoSettings = async (page: Page, reason: string) => {
    const video = page.locator('video').first();
    const hasVideo = await video.isVisible().catch(() => false);
    if (!hasVideo) {
        const logFile = (page as any).__playbackLogFile || "./context/politic-playback.log";
        writePlaybackLog(logFile, `[${reason}] 当前页面没有可见 video，跳过静音和倍速设置`);
        return;
    }

    const settings = await video.evaluate(v => {
        const el = v as HTMLVideoElement;
        el.muted = true;
        el.volume = 0;
        el.playbackRate = 1; // 改回1倍速
        return {
            muted: el.muted,
            volume: Number(el.volume ?? 0),
            playbackRate: Number(el.playbackRate ?? 1)
        };
    }).catch(() => null);

    if (settings) {
        const logFile = (page as any).__playbackLogFile || "./context/politic-playback.log";
        writePlaybackLog(logFile, `[${reason}] 已应用播放器设置 muted=${settings.muted} volume=${settings.volume} playbackRate=${settings.playbackRate}`);
    }
};

const tryResumeVideo = async (page: Page, reason: string) => {
    const logFile = (page as any).__playbackLogFile || "./context/politic-playback.log";
    const video = page.locator('video').first();
    const hasVideo = await video.isVisible().catch(() => false);
    if (!hasVideo) {
        writePlaybackLog(logFile, `[${reason}] 当前页面没有可见 video`);
        return;
    }
    const paused = await video.evaluate(v => (v as HTMLVideoElement).paused).catch(() => true);
    const currentTime = await video.evaluate(v => Number((v as HTMLVideoElement).currentTime || 0)).catch(() => -1);
    writePlaybackLog(logFile, `[${reason}] 恢复前 paused=${paused} currentTime=${currentTime}`);
    if (!paused) {
        return;
    }
    const bigPlay = page.locator('.vjs-big-play-button');
    const hasBigPlay = await bigPlay.isVisible().catch(() => false);
    if (hasBigPlay) {
        await bigPlay.click({ force: true }).catch(() => {});
        await page.waitForTimeout(200);
        writePlaybackLog(logFile, `[${reason}] 点击大播放按钮`);
    }
    await applyPreferredVideoSettings(page, `${reason}-播放前设置`);
    await video.evaluate(v => (v as HTMLVideoElement).play()).catch(() => {});
    await page.waitForTimeout(300);
    await applyPreferredVideoSettings(page, `${reason}-播放后设置`);
    const pausedAfter = await video.evaluate(v => (v as HTMLVideoElement).paused).catch(() => true);
    const currentTimeAfter = await video.evaluate(v => Number((v as HTMLVideoElement).currentTime || 0)).catch(() => -1);
    writePlaybackLog(logFile, `[${reason}] 恢复后 paused=${pausedAfter} currentTime=${currentTimeAfter}`);
};

const clickNextIncompleteCourse = async (page: Page, reason: string) => {
    const logFile = (page as any).__playbackLogFile || "./context/politic-playback.log";
    const allItems = await page.locator('li.clearfix.video').elementHandles();
    if (allItems.length === 0) {
        writePlaybackLog(logFile, `[${reason}] 未找到任何课程视频项`);
        return false;
    }

    let currentIndex = -1;
    for (let i = 0; i < allItems.length; i++) {
        const className = await allItems[i].getAttribute('class');
        if ((className || '').includes('current_play')) {
            currentIndex = i;
            break;
        }
    }

    writePlaybackLog(logFile, `[${reason}] 当前播放项索引=${currentIndex}，总视频项=${allItems.length}`);

    for (let i = currentIndex + 1; i < allItems.length; i++) {
        const hasFinish = await allItems[i].$('.time_icofinish');
        if (hasFinish) {
            continue;
        }
        const title = await allItems[i].$('.catalogue_title');
        const titleText = (await title?.textContent()?.catch(() => '')) || '';
        writePlaybackLog(logFile, `[${reason}] 准备切到下一未完成课程 index=${i} title=${titleText.trim()}`);
        const linkHandle = await allItems[i].$('a');
        if (linkHandle) {
            await linkHandle.click({ force: true }).catch(() => {});
        } else {
            await allItems[i].click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(6000);
        return true;
    }

    writePlaybackLog(logFile, `[${reason}] 当前播放项之后没有未完成课程`);
    return false;
};

const trySwitchNextCourse = async (page: Page, reason: string) => {
    const switched = await clickNextIncompleteCourse(page, reason);
    if (!switched) {
        return false;
    }
    await page.waitForTimeout(3000);
    await closeAllPopups(page);
    await applyPreferredVideoSettings(page, `${reason}-切课后设置`);
    await tryResumeVideo(page, `${reason}-切课后恢复`);
    return true;
};

const isCurrentCourseMarkedFinished = async (page: Page) => {
    const logFile = (page as any).__playbackLogFile || "./context/politic-playback.log";
    const currentItem = page.locator('li.clearfix.video.current_play').first();
    const visible = await currentItem.isVisible().catch(() => false);
    if (!visible) {
        return false;
    }
    const hasFinish = await currentItem.locator('.time_icofinish').count().catch(() => 0);
    const title = await currentItem.locator('.catalogue_title').first().innerText().catch(() => '');
    writePlaybackLog(logFile, `[轮询] 当前播放课程=${title.trim()} finishedMark=${hasFinish > 0}`);
    return hasFinish > 0;
};

const getPlaybackMonitorStarted = (page: Page) => Boolean((page as any).__playbackMonitorStarted);

const setPlaybackMonitorStarted = (page: Page, started: boolean) => {
    (page as any).__playbackMonitorStarted = started;
};

const getDialogMonitorStarted = (page: Page) => Boolean((page as any).__dialogMonitorStarted);

const setDialogMonitorStarted = (page: Page, started: boolean) => {
    (page as any).__dialogMonitorStarted = started;
};


// 按用户给的选择器关闭所有已知弹窗
const closeAllPopups = async (page: Page) => {
    // 1. 关闭顶部温馨提示弹窗 "不再提示" （截图里看到的）
    const noMoreTipBtn = page.locator('.el-message-box__header button, .el-message-box__footer button:has-text("不再提示")');
    if (await noMoreTipBtn.isVisible()) {
        console.log("关闭顶部温馨提示弹窗");
        await noMoreTipBtn.click({ force: true });
        await page.waitForTimeout(500);
    }
    // 2. 关闭进度提醒弹窗（王玉杰同学那个），整个弹窗在 el-dialog 里，关闭按钮是 .ss2077-custom-title .icon
    const progressCloseBtn = page.locator('.ss2077-custom-title img.icon');
    if (await progressCloseBtn.isVisible()) {
        console.log("检测到进度提醒弹窗，关闭");
        await progressCloseBtn.click({ force: true });
        await page.waitForTimeout(500);
    }
    // 3. 关闭 .dialog-read 弹窗：按用户给的，点 .dialog-read 下的 i.iconfont.iconguanbi
    const closeBtn = page.locator('.dialog-read .iconfont.iconguanbi');
    if (await closeBtn.isVisible()) {
        console.log("检测到阅读弹窗，关闭");
        await closeBtn.click({ force: true });
        await page.waitForTimeout(500);
    }
    // 4. 关闭 AI助教弹题弹窗：按实际HTML结构
    const questionDialog = page.locator('div.el-dialog[aria-label="弹题测验"]');
    if (await questionDialog.isVisible()) {
        console.log("检测到弹题弹窗，尝试关闭");
        // 先试右上角叉号：实际可点击的是 button，不是 i，i 只是图标！
        const closeX = questionDialog.locator('button.el-dialog__headerbtn');
        if (await closeX.isVisible()) {
            console.log("点右上角按钮关闭弹题");
            await closeX.click({ force: true });
            await page.waitForTimeout(500);
        } else {
            // 再试底部「关闭」按钮，HTML 结构是 .dialog-footer .btn
            const footerBtn = questionDialog.locator('.dialog-footer .btn');
            if (await footerBtn.isVisible()) {
                console.log("点底部关闭按钮关闭弹题");
                await footerBtn.click({ force: true });
                await page.waitForTimeout(500);
            }
        }
    }
};

const ensureVideoPlaying = async (page: Page) => {
    const logFile = (page as any).__playbackLogFile || "./context/politic-playback.log";
    if (getPlaybackMonitorStarted(page)) {
        return;
    }
    setPlaybackMonitorStarted(page, true);
    writePlaybackLog(logFile, "[轮询] 播放监控已启动");

    while (!page.isClosed()) {
        try {
            const video = page.locator('video').first();
            const state = await getVideoPlaybackState(page);
            if (!state.hasVideo) {
                writePlaybackLog(logFile, "[轮询] 当前页面没有视频，10秒后重试");
                await page.waitForTimeout(10000);
                continue;
            }

            const videosCount = await page.locator('video').count();
            writePlaybackLog(logFile, `[轮询] 页面上共有 ${videosCount} 个video元素`);
            writePlaybackLog(logFile, `[轮询] 视频状态 paused=${state.paused} ended=${state.ended} nearEnd=${state.nearEnd} currentTime=${state.currentTime} duration=${state.duration}`);

            await applyPreferredVideoSettings(page, "轮询");

            const currentFinished = await isCurrentCourseMarkedFinished(page);
            // 只有当视频真正结束或标记为已完成时才切换课程
            if (state.ended || currentFinished) {
                writePlaybackLog(logFile, `[轮询] 检测到当前课程已完成，尝试切换下一节 ended=${state.ended} currentFinished=${currentFinished}`);
                const switched = await trySwitchNextCourse(page, "轮询切课");
                if (switched) {
                    await page.waitForTimeout(15000);
                    continue;
                }
            }

            if (state.paused && !state.ended) {
                await tryResumeVideo(page, "轮询");
            }

            const signatureBefore = await getCourseSignature(page);
            writePlaybackLog(logFile, `[轮询] 保持当前课程，10秒后继续检查，signature=${signatureBefore}`);
        } catch (e) {
            writePlaybackLog(logFile, `检查视频出错，10秒后重试：${e.message}`);
        }

        await page.waitForTimeout(10000);
    }
};

test.describe.configure({ mode: 'parallel' });

for (const [accountKey, currentPoliticUser] of activePoliticUsers) {
test(`politics_course_${accountKey}`, async () => {
    const url = 'https://onlineweb.zhihuishu.com/onlinestuh5'
    const userName = currentPoliticUser.userName
    const shouldWriteExercise = currentPoliticUser.shouldWriteExercise
    const playbackLogFile = `./context/politic-playback-${userName}.log`;
    const ocrService = new OCRService()
    await ocrService.ocrInit()
    test.setTimeout(100000000);

    const loginInTool = new LoginINTool(userName, url)
    let browserContext: BrowserContext = await loginInTool.loadState()
    try {
        fs.writeFileSync(playbackLogFile, "", "utf8");
    } catch (e) {
        console.log("清空播放日志失败：", e.message);
    }
    writePlaybackLog(playbackLogFile, `测试开始 userName=${userName} shouldWriteExercise=${shouldWriteExercise}`);

    console.log("加载用户：" + userName)
    let page = await browserContext.newPage()
    ;(page as any).__playbackLogFile = playbackLogFile;
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    console.log("当前课程进度：" + await page.locator('.datalist .processNum').innerText().catch(() => '未读取到进度'))
    await loginInTool.saveState(browserContext, page)
    // 等待课程点击完成并加载完毕（当前页跳转）
    await page.locator('.datalist .courseName').click();
    // 等导航完成 + 网络空闲
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    // 先关可能弹出的弹窗，再等第二个目录
    await closeAllPopups(page);
    // 定位目录：第二个 .el-scrollbar__wrap，等它出现
    const catalogWrap = page.locator('.el-scrollbar__wrap').nth(1);
    await catalogWrap.waitFor({ timeout: 30000 });
        console.log("课程页面加载完成，开始播放");
    // 自动遍历点击第一个未完成的课程
    const clickFirstIncomplete = async () => {
        // 先关所有弹窗，保证能点击到目录
        await closeAllPopups(page);
        // 找所有课程 li.clearfix.video，从整个页面找，过滤掉有 .time_icofinish 的（已完成），取第一个
        // 手动 JavaScript 过滤，绝对可靠
        const allItems = await page.locator('li.clearfix.video').elementHandles();
        const incompleteItems: any[] = [];
        for (const item of allItems) {
            const hasFinish = await item.$('.time_icofinish');
            if (!hasFinish) {
                incompleteItems.push(item);
            }
        }
        const count = incompleteItems.length;
        if (count === 0) {
            console.log("所有课程都已完成！");
            return;
        }
    // 点击第一个未完成
    await incompleteItems[0].click({ force: true });
    writePlaybackLog(playbackLogFile, `已点击第 1 个未完成课程，剩余：${count - 1}`);
    // 视频加载完，开始定时检查播放状态，如果暂停就继续播放
    setTimeout(async () => {
        await ensureVideoPlaying(page);
    }, 1000);
    };
    // 点击第一个未完成为入口
    await clickFirstIncomplete();

    // 定时轮询检测弹窗，每 5 秒检测一次，不阻塞视频播放
    const checkDialog = async () => {
        if (getDialogMonitorStarted(page)) {
            return;
        }
        setDialogMonitorStarted(page, true);
        try {
            while (!page.isClosed()) {
                const noMoreTipBtn = page.locator('.el-message-box__header button, .el-message-box__footer button:has-text("不再提示")');
                if (await noMoreTipBtn.isVisible().catch(() => false)) {
                    console.log("关闭顶部温馨提示弹窗");
                    await noMoreTipBtn.click({ force: true });
                    await page.waitForTimeout(500);
                }

                const progressCloseBtn = page.locator('.ss2077-custom-title img.icon');
                if (await progressCloseBtn.isVisible().catch(() => false)) {
                    console.log("检测到进度提醒弹窗，关闭");
                    await progressCloseBtn.click({ force: true });
                    await page.waitForTimeout(500);
                }

                const closeBtn = page.locator('.dialog-read .iconfont.iconguanbi');
                if (await closeBtn.isVisible().catch(() => false)) {
                    console.log("检测到阅读弹窗，关闭");
                    await closeBtn.click({ force: true });
                    await page.waitForTimeout(500);
                }

                const questionDialog = page.locator('div.el-dialog[aria-label="弹题测验"]');
                const isVisible = await questionDialog.locator('.el-dialog__body .topic .radio').isVisible().catch(() => false);
                if (isVisible) {
                    console.log("检测到弹题测验，开始答题...");
                    const topic = questionDialog.locator('.el-dialog__body .topic').first();
                    const hasAnswer = await questionDialog.locator('.answer').isVisible().catch(() => false);
                    if (hasAnswer) {
                        console.log("题目已经答完，直接关闭弹窗");
                        await page.waitForTimeout(500);
                        const closeX = page.locator('div.el-dialog[aria-label="弹题测验"] button.el-dialog__headerbtn');
                        const closeFooterBtn = page.locator('div.el-dialog[aria-label="弹题测验"] .el-dialog__footer button:has-text("关闭")');
                        if (await closeFooterBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                            await closeFooterBtn.click({ force: true });
                            console.log("关闭弹题弹窗（底部关闭按钮）");
                        } else if (await closeX.isVisible({ timeout: 500 }).catch(() => false)) {
                            await closeX.click({ force: true });
                            console.log("关闭弹题弹窗（右上角关闭）");
                        }
                    } else {
                        const titleParts = await topic.locator('.radio .topic-title span').allInnerTexts().catch(() => []);
                        const questionText = titleParts.join(' ').trim();
                        const options = topic.locator('.radio .topic-list .topic-item');
                        const optionCount = await options.count();
                        let questionFull = questionText + '\n';
                        for (let i = 0; i < optionCount; i++) {
                            const optionText = await options.nth(i).locator('.item-topic').innerText().catch(() => '');
                            const optionLetter = await options.nth(i).locator('.topic-option-item').innerText().catch(() => '');
                            questionFull += `${optionLetter} ${optionText}\n`;
                        }
                        console.log("提取题目：" + questionFull);
                        let prompt: string = "你是一道选择题，请直接给出正确答案的选项序号，A对应1，B对应2，C对应3，D对应4，只回复一个数字，不要有任何其他内容。题目：\n" + questionFull;
                        let answer: string = (await callAIResponse(prompt)).choices[0].message.content.trim();
                        const answerNum = answer.match(/\d/) ? answer.match(/\d/)[0] : answer;
                        console.log("AI回答：" + answerNum);
                        await options.nth(Number(answerNum) - 1).locator('.topic-option').click({ force: true });
                        if (shouldWriteExercise) {
                            await appendToJson("./context/eocExercise.json", {'question': questionFull, 'answer': answerNum});
                            writePlaybackLog(playbackLogFile, `[弹题测验] 已写入习题库 answer=${answerNum}`);
                        } else {
                            writePlaybackLog(playbackLogFile, `[弹题测验] 已答题但跳过写入习题库 answer=${answerNum}`);
                        }
                        await page.waitForTimeout(500);
                        const submitBtn = questionDialog.locator('.el-dialog__footer button').first();
                        if (await submitBtn.isVisible().catch(() => false)) {
                            await submitBtn.click();
                            console.log("已提交答案");
                        }
                        await page.waitForTimeout(1000);
                        const closeX = page.locator('div.el-dialog[aria-label="弹题测验"] button.el-dialog__headerbtn');
                        const closeFooterBtn = page.locator('div.el-dialog[aria-label="弹题测验"] .el-dialog__footer button:has-text("关闭")');
                        if (await closeFooterBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                            await closeFooterBtn.click({ force: true });
                            console.log("关闭弹题弹窗（底部关闭按钮）");
                        } else if (await closeX.isVisible({ timeout: 500 }).catch(() => false)) {
                            await closeX.click({ force: true });
                            console.log("关闭弹题弹窗（右上角关闭）");
                        }
                    }
                }

                const playbackState = await getVideoPlaybackState(page);
                const currentFinished = await isCurrentCourseMarkedFinished(page);
                // 只有当视频真正结束或标记为已完成时才切换课程
                if (playbackState.ended || currentFinished) {
                    writePlaybackLog(playbackLogFile, `[弹窗检测] 检测到当前课程完成，尝试切换下一节 ended=${playbackState.ended} currentFinished=${currentFinished}`);
                    const switched = await trySwitchNextCourse(page, "弹窗检测切课");
                    if (!switched && playbackState.paused && !playbackState.ended) {
                        await tryResumeVideo(page, "弹窗检测");
                    }
                } else {
                    await tryResumeVideo(page, "弹窗检测");
                }

                await page.waitForTimeout(5000);
            }
        } catch (e) {
            writePlaybackLog(playbackLogFile, `检测弹窗出错，5 秒后重试：${e.message}`);
            setDialogMonitorStarted(page, false);
            setTimeout(checkDialog, 5000);
        }
    };
    // 开始轮询
    checkDialog();

    await page.waitForTimeout(1000 * 6000)
})
}

class LoginINTool {
    name: string
    user_file: string
    target_url: string

    constructor(name: string, url: string) {
        this.name = name
        this.user_file = "./context/" + this.name + ".json"
        this.target_url = url

    }

    async ensureAuthenticated(browserContext: BrowserContext, page?: Page) {
        const activePage = page || await browserContext.newPage()
        const shouldClosePage = !page

        try {
            await activePage.goto(this.target_url, { waitUntil: 'domcontentloaded' }).catch(() => {
                console.log("页面加载超时，继续执行...");
            });

            const isLoginPage = () => activePage.url().includes('passport.zhihuishu.com/login');
            if (isLoginPage()) {
                console.log(`账号 ${this.name} 上下文已失效，请先在打开的浏览器中完成登录`);
                await activePage.waitForURL(url => !url.toString().includes('passport.zhihuishu.com/login'), { timeout: 10 * 60 * 1000 });
                await activePage.waitForTimeout(2000);
            }

            if (!activePage.url().includes('onlineweb.zhihuishu.com/onlinestuh5')) {
                await activePage.goto(this.target_url, { waitUntil: 'domcontentloaded' }).catch(() => {
                    console.log("登录后返回课程页超时，继续执行...");
                });
            }

            await activePage.locator('.datalist .courseName').first().waitFor({ timeout: 60000 }).catch(() => {});
            await browserContext.storageState({path: this.user_file})
            return browserContext
        } finally {
            if (shouldClosePage) {
                await activePage.close().catch(() => {})
            }
        }
    }

    async saveState(browserContext: BrowserContext, page?: Page) {
        return await this.ensureAuthenticated(browserContext, page)
    }

    async loadState() {

        const browser: Browser = await chromium.launch({
            channel: 'msedge',
            headless: false
        })
        const browserContext: BrowserContext = fs.existsSync(this.user_file)
            ? await browser.newContext({storageState: this.user_file})
            : await browser.newContext()

        await this.ensureAuthenticated(browserContext)
        return browserContext
    }
}
