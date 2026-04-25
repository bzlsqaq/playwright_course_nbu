import {createWorker} from "tesseract.js";
import {Locator} from "@playwright/test";

export class OCRService {
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