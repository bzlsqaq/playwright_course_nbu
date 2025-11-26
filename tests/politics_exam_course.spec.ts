import {chromium, test} from '@playwright/test';
import {createWorker} from 'tesseract.js';
import {readFile, writeFile} from 'node:fs/promises'
import axios from 'axios'
import {politics_exam_config as config} from'./config'
//填写对应的页面链接
const url = config.PAGE_URL
const fixedMemory = [{role: 'system', content: '你的固定记忆内容，如：用户研究量子力学'}];

test('politics_exam_course', async () => {
    test.setTimeout(100000000);

    const browser = await chromium.launch({
        channel: 'msedge',
        headless: false,
        args: [
            '--profile-directory=Default',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    })
    const context = await browser.newContext()
    let page = await context.newPage();

    let exam_finished;
    const worker = await createWorker(['eng', 'chi_sim']);
    await worker.setParameters({preserve_interword_spaces: '1'})
    do {
        exam_finished = true;
        await page.goto(url);
        const newPagePromise = context.waitForEvent('page');
        let exam_item = page.locator('.chapter-list>.content>div:last-child').filter({
            hasNotText: '已完成',
            visible: true
        }).first();
        await exam_item.click();
        let newPage = await newPagePromise;
        console.log('当前页面：', await exam_item.locator('.title').innerText())
        await page.close();
        page = newPage;
        await page.waitForLoadState('networkidle')
        let exist_question = true
        do {
            let exam_name = await page.locator('.header-bar__wrap .text-ellipsis').innerText()
            let li_list = page.locator('.pt10>li').filter({hasNot: page.locator('.dot-success').or(page.locator('.dot-danger'))});
            let li = li_list.first()
            let li_num = await li.locator('>div').getAttribute('examasideclosesubjectitem')
            await li.click()
            let subject = await page.locator('.item-type').innerText()
            const [list_num, subject_text] = subject.split('.')
            if (li_num !== list_num) {
                console.log('题目序号不一致', li_num, list_num)
            }
            console.log(exam_name, '当前题目', subject)
            let content_text_buffer = await page.locator('.item-body').screenshot()//{path: exam_name + li_num + '.png'}
            let content_text_ocr = await worker.recognize(content_text_buffer)
            let content_text = content_text_ocr.data.text
            const res = await axios.post(config.MODEL_URL, {
                model: config.MODEL,
                messages: [...fixedMemory, {role: 'user', content: content_text}]
            }, {
                headers: {'Authorization': config.API_KEY}
            });
            await text_in_json(li_num, subject_text + content_text, '', exam_name + '.json')

        } while (exist_question)

        await page.waitForTimeout(100000)
    } while (exam_finished)


    await context.close();
    await worker.terminate();

})

async function text_in_json(li_key: string, text: string, answer: string = '', path: string = 'data.json') {
    let data_json: object = {}
    try {
        let data = await readFile('./data/'+path, 'utf-8')
        data_json = JSON.parse(data)
    } catch (err) {
        console.error(err)
    }
    data_json[li_key] = {
        'content': text,
        'answer': answer
    }
    await writeFile(path, JSON.stringify(data_json))
}
