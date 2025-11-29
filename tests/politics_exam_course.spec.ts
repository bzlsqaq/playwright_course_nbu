import {chromium, expect, Locator, test} from '@playwright/test';
import {createWorker} from 'tesseract.js';
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import axios from 'axios'
import {politics_exam_config as config} from './config'
//填写对应的页面链接
const url = config.PAGE_URL
const fixedMemory = [{role: 'system', content: config.PROMPT}];

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
    const worker = await createWorker('chi_sim');
    await worker.setParameters({preserve_interword_spaces: '1'})
    do {
        exam_finished = true;
        await page.goto(url);
        const newPagePromise = context.waitForEvent('page');
        let exam_item = page.locator('.chapter-list>.content>div:last-child').filter({
            hasNotText: '已完成',
            visible: true
        })

        const exam_item_first = exam_item.first();
        try {
            await exam_item_first.click();

        } catch (e) {
            if (await exam_item_first.count() == 0) {
                break
            }
        }

        let newPage = await newPagePromise;
        console.log('当前页面：', await exam_item_first.locator('.title').innerText())
        await page.close();
        page = newPage;
        await page.waitForLoadState('networkidle')
        let exist_question = true
        let exam_name = await page.locator('.header-bar__wrap .text-ellipsis').innerText()
        let li_list = page.locator('.pt10>li').filter({hasNot: page.locator('.dot-success').or(page.locator('.dot-danger'))});
        let li = li_list.first()


        do {
            try {
                await expect(li).toContainClass('active')
            } catch (e) {
                await li.click()
            }
            let subject = await page.locator('.item-type').innerText()
            let content_text_body = page.locator('.item-body')
            const [list_num, subject_text] = subject.split('.')

            console.log(exam_name, '当前题目', subject)
            let content_text_buffer: string | Buffer<ArrayBufferLike> | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | CanvasRenderingContext2D | Blob | OffscreenCanvas;
            if(await content_text_body.locator('>div>ul>li').count()==2){
                content_text_buffer=await content_text_body.locator('>div>.problem-body').screenshot()
            }else {
                 content_text_buffer= await content_text_body.screenshot()
            }
            //{path: exam_name + li_num + '.png'}
            let content_text_ocr = await worker.recognize(content_text_buffer)
            let content_text = content_text_ocr.data.text
            let answer_text: string;
            try {
                const res = await axios.post(config.MODEL_URL, {
                    model: config.MODEL_ID,
                    messages: [...fixedMemory, {role: 'user', content: content_text}]
                }, {
                    headers: {'Authorization': 'Bearer ' + config.API_KEY, 'Content-Type': 'application/json'}
                });
                console.log('请求成功：', res.data);
                answer_text = res.data.choices[0].message.content;

            } catch (error) {
                if (axios.isAxiosError(error)) {
                    console.error('401 错误详情：', {
                        status: error.response?.status,
                        data: error.response?.data,
                        requestHeaders: error.config?.headers
                    });
                }
            }
            await text_in_json(list_num, subject_text + content_text, answer_text, exam_name + '.json')
            for (const option of split_answer(answer_text)) {
                const option_li_list = content_text_body.locator('>div>ul>li')
                console.log(option, 'option')
                let option_li:Locator;
                if(option=='Y'){
                     option_li=option_li_list.nth(0)
                }else if(option=="W"){
                    option_li =option_li_list.nth(1)
                }else{
                    option_li=option_li_list.filter({
                    hasText: option,
                    visible: true
                })
                }
                const label=option_li.locator(">label")
                let not_checked: boolean;
                try {
                    await expect(label).toContainClass('is-checked')
                    not_checked = false
                } catch (e) {
                    not_checked = true
                }
                if (not_checked) {
                    try{
                        await label.click({timeout:10000})//10秒找不到选项强制提交
                    }catch (e) {
                        
                    }
                    

                }

            }
            await page.locator('.problem-fixedbar').getByText('提交').filter({visible: true}).click()
            await page.waitForTimeout(1000)
            const li_list_count = await li_list.count()
            if (li_list_count == 0) {
                exist_question = false
            }
        } while (exist_question)


    } while (exam_finished)


    await context.close();
    await worker.terminate();

})

async function text_in_json(li_key: string, text: string, answer: string = '', file_path: string = 'data.json') {
    let data_json: object = {}
    let dir_path = './data/'
    try {
        let data = await readFile(dir_path + file_path, 'utf-8')
        data_json = JSON.parse(data)
    } catch (err) {
        await mkdir(dir_path, {recursive: true});
        console.error(err)
    }
    data_json[li_key] = {
        'content': text,
        'answer': answer
    }
    await writeFile(dir_path + file_path, JSON.stringify(data_json))
}

function split_answer(answer_str: string) {
    const str = answer_str.split('&')
    console.log(str)
    return str
}