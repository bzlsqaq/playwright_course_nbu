const fs = require('node:fs');
const path = require('node:path');

// --- 配置区域 ---
const DATA_DIR = '../../data/data_politics/course/'; // 你的 JSON 文件夹路径
const OUTPUT_FILE = '../../data/data_politics/course/print_version.html'; // 输出文件名
const FONT_SIZE = '14px'; // 字体大小 (12px-16px 适合打印)
const HIDE_ANSWER = false; // 是否隐藏答案 (如果想做成试卷给自己测，设为 true)

// ----------------

function generateHtml() {
    // 1. 获取所有 json 文件
    const files = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));

    // 按文件名排序 (可选，看你需要不需要按章节顺序)
    files.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));

    let htmlContent = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <title>复习资料打印版</title>
        <style>
            /* 基础样式 */
            body {
                font-family: "Microsoft YaHei", "SimSun", sans-serif;
                font-size: ${FONT_SIZE};
                line-height: 1.4;
                color: #000;
                margin: 0;
                padding: 20px;
            }
            
            /* 章节标题 */
            h1.chapter-title {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 10px;
                margin-bottom: 20px;
                font-size: 1.5em;
            }

            /* 每一页的容器 (一单元一页) */
            .chapter-page {
                page-break-after: always; /* 打印时强制分页 */
                margin-bottom: 50px;
            }

            /* 单个题目块 */
            .question-block {
                margin-bottom: 12px;
                break-inside: avoid; /* 防止题目被打印分页切断 */
                border-bottom: 1px dashed #ccc; /* 虚线分隔，可删 */
                padding-bottom: 8px;
            }

            /* 题目名称 */
            .q-name {
                font-weight: bold;
                display: inline; /* 紧凑布局 */
            }

            /* 选项布局 */
            .q-options {
                display: block;
                margin-top: 4px;
                margin-left: 1em;
            }
            
            .option-item {
                margin-right: 15px;
                display: inline-block; /* 选项横向排列，省纸 */
            }

            /* 答案 */
            .q-answer {
                font-weight: bold;
                color: #d9534f; /* 红色高亮答案 */
                margin-left: 10px;
                display: ${HIDE_ANSWER ? 'none' : 'inline-block'};
            }

            /* 打印专用优化 */
            @media print {
                body { padding: 0; }
                .chapter-page { page-break-after: always; }
                .q-answer { color: #000 !important; font-weight: 900; } /* 打印时变黑 */
            }
        </style>
    </head>
    <body>
    `;

    // 2. 遍历每个文件 (章节)
    for (const file of files) {
        const filePath = path.join(DATA_DIR, file);
        const chapterName = file.replace('.json', ''); // 文件名作为章节名

        let data = {};
        try {
            data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            console.error(`读取文件失败: ${file}`);
            continue;
        }

        // 开始新的页面容器
        htmlContent += `<div class="chapter-page">`;
        htmlContent += `<h1 class="chapter-title">${chapterName}</h1>`;

        // 3. 遍历题目 (按 ID 排序)
        const questionIds = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b));

        for (const qId of questionIds) {
            const q = data[qId];

            // 构建题目 HTML
            htmlContent += `<div class="question-block">`;

            // 题干 (例如: 1. [单选题] 题目内容...)
            // 这里的 q.name 是 OCR 出来的，如果太长可以自己截取
            htmlContent += `<div class="q-name">${qId}. ${q.name || ''}</div>`;

            // 答案 (紧跟题干，如果不换行)
            if (q.answer) {
                 htmlContent += `<div class="q-answer">[答案: ${q.answer}]</div>`;
            }

            // 选项 (如果是选择题)
            const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
            let hasOptions = false;
            let optionsHtml = '<div class="q-options">';

            for (const k of keys) {
                if (q[k]) {
                    hasOptions = true;
                    // 选项加粗逻辑：如果答案包含这个选项 (比如答案 AB，当前是 A)，就加粗
                    // 注意：这需要简单判断，如果不需要可以直接去掉 strong
                    const isCorrect = q.answer && q.answer.includes(k);
                    const style = isCorrect ? 'text-decoration: underline;' : '';

                    optionsHtml += `<span class="option-item" style="${style}">
                        <b>${k}.</b> ${q[k]}
                    </span>`;
                }
            }
            optionsHtml += '</div>';

            if (hasOptions) {
                htmlContent += optionsHtml;
            }

            htmlContent += `</div>`; // end question-block
        }

        htmlContent += `</div>`; // end chapter-page
    }

    htmlContent += `</body></html>`;

    // 4. 写入 HTML
    fs.writeFileSync(OUTPUT_FILE, htmlContent);
    console.log(`✅ HTML 已生成: ${OUTPUT_FILE}`);
    console.log(`👉 请用浏览器打开该文件，然后按 Ctrl + P 打印 -> 另存为 PDF`);
}

generateHtml();