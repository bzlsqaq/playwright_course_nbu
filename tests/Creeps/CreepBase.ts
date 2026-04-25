import {BrowserContext, chromium, Locator, Page} from '@playwright/test';
import {createWorker} from 'tesseract.js';



export class PageTools {
    readonly page: Page;
    readonly locator: Locator;
    private finished_list: Array<Locator>
    elemCount: number

    constructor(page: Page, selector: string, obj_filter?: object) {
        this.page = page;
        this.locator = this.page.locator(selector)
        if (obj_filter) {
            this.locator = this.locator.filter(obj_filter)
        }
    }

    async getFirstElem() {

        await this.page.waitForLoadState('networkidle')
        if (!this.finished_list) {
            this.finished_list = await this.locator.all()
            this.finished_list.reverse()
        }


        this.elemCount = this.finished_list.length
        if (this.elemCount == 0) {
            return undefined
        }
        return this.finished_list[this.elemCount - 1]

    }

    async action(actionlogic: Function) {
        await actionlogic()
    }

    async elemFinished(locator1: Locator) {

        this.finished_list.pop()
        if (this.elemCount - 1 <= 0) {
            await this.page.close()
            return false
        }
        return true
    }


}

export class RegisterPage {
    readonly UID: string;
    readonly dir_path :string;

    constructor(UID: string,UID_path:string) {
        this.UID = UID
        this.dir_path=UID_path
    }


    async getStartPage(url: string) {
        const user_file = this.dir_path + this.UID + '.json'
        let browser = await chromium.launch({headless: false})
        let browserContext: BrowserContext
        let page: Page;
        try {

            browserContext = await browser.newContext({storageState: user_file})
            page = await browserContext.newPage()
            await page.goto(url)
            await page.waitForLoadState('networkidle')
            await page.waitForURL(url, {timeout: 1000})

        } catch {
            if (browserContext) await browserContext.close();
            browserContext = await browser.newContext()
            page = await browserContext.newPage()
            await page.goto(url)
            await page.waitForLoadState('networkidle')
            await page.waitForURL(url)
            await browserContext.storageState({path: user_file})

        }
        return page
    }
}

// AIService.ts (补充)

export class AIService {
    private worker: any;

    async ocrInit() {
        // 初始化一次 worker，避免重复加载
        this.worker = await createWorker(['chi_sim', 'eng']);
        await this.worker.setParameters({preserve_interword_spaces: '1'})
    }

    async ocrDestroy() {
        if (this.worker) await this.worker.terminate();
    }

    /**
     * 核心方法：传入 Locator，自动截图并识别文字
     */
    async ocrLocator(locator: Locator): Promise<string> {
        try {
            // 1. 确保元素可见，防止截图空白
            if (await locator.isVisible()) {
                // 2. 截图拿到 Buffer
                const buffer = await locator.screenshot();
                // 3. 识别
                const ret = await this.worker.recognize(buffer);
                // 4. 清理换行符和多余空格
                return ret.data.text.replace(/\s+/g, ' ').trim();
            }
            return "";
        } catch (e) {
            console.error("OCR 识别失败:", e);
            return "OCR_FAILED";
        }
    }
}