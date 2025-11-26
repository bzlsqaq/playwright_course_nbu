//@ts-check
import {test, expect} from '@playwright/test';

const name = ''
const password = ''
//https://nbulabsafe.nbu.edu.cn/lab-study-front/trainTask/71
//https://nbulabsafe.nbu.edu.cn/lab-study-front/examTask/177
const url1 = 'https://nbulabsafe.nbu.edu.cn/lab-study-front/examTask/177'


test('nbu_course1', async ({page}) => {
    test.setTimeout(100000000);
    await page.goto('https://nbulabsafe.nbu.edu.cn/lab-study-front/person');
    await page.locator('.ivu-btn.ivu-btn-long.ivu-btn-primary').click()


    const user_input = await page.locator('.username.item > #username[title^="用户名"]').filter({visible: true})
    await user_input.fill(name)

    await page.locator('.password.item > #password').filter({visible: true}).fill(password)
    await page.locator('#login_submit').first().click();
    await page.waitForURL('https://nbulabsafe.nbu.edu.cn/lab-platform/lab-personnel');

    await page.goto(url1);

    await page.getByText('去学习').first().waitFor({state: "visible", timeout: 5000});

    let table = await page.locator('.ivu-table-tbody').filter({visible: true});

    let row_reverse = 0;

    while (await page.getByText('去学习').count() > 0) {

        let row;
        row = await table.locator('.ivu-table-row').nth(row_reverse)
        if (row_reverse === 3) {
            row_reverse = 0;
        } else {
            row_reverse++;
        }

        let current_text = await row.locator('.ppp').innerText();
        let str = await row.locator('.ivu-table-cell').nth(1).innerText()
        await row.getByText('去学习').click()
        if (str !== '微课堂') {
            await page.locator('.alredyTime').waitFor({state: 'visible', timeout: 5000});
            let success = true
            while (success) {
                await page.waitForTimeout(5000)
                let time = await page.locator('.alredyTime').innerText()
                if (typeof time !== 'string') {
                    throw new Error(`获取的时间不是字符串，实际值：${time}`);
                }
                let limit_time = await page.locator('.allTime').innerText()


                console.log(current_text, time, limit_time)


                let num_time = mmssToSeconds(time, false)
                let num_limit_time = mmssToSeconds(limit_time, false)

                if (num_time > num_limit_time) {
                    success = false
                }
            }
        } else {

            await page.locator('.palyer_right_bottom>div>span').nth(0).waitFor({state: 'visible', timeout: 5000});
            let success = true

            while (success) {
                await page.waitForTimeout(5000)
                let time = await page.locator('.palyer_right_bottom>div>span').nth(0).innerText()
                if (typeof time !== 'string') {
                    throw new Error(`获取的时间不是字符串，实际值：${time}`);
                }
                let limit_time = await page.locator('.palyer_right_bottom>div>span').nth(1).innerText()

                let num_time = mmssToSeconds(time, true)
                let num_limit_time = mmssToSeconds(limit_time, true)

                console.log(current_text, time, limit_time)

                if (num_time >= num_limit_time) {
                    success = false
                }
                if (success === true) {
                    let close = false;
                    close = await page.locator('.ivu-modal-confirm-body').isVisible({timeout: 1000})


                    if (close === true) {

                        let alert_text = await page.locator('.ivu-modal-confirm-body').innerText()

                        if (alert_text === '视频已经播放完毕，请选择其他视频!' || alert_text === '视频已经学习完，是否重新学习!') {

                            await page.locator('.ivu-modal-confirm-footer').getByText('确定').click()
                            if (await page.locator(".prism-play-btn.playing").isVisible({timeout: 1000}) === false) {
                                await page.locator('.prism-play-btn').click()
                            }

                        }
                    }


                }
            }
        }
        await page.goto(url1);
        await page.getByText('去学习').first().waitFor({state: 'visible', timeout: 5000});


    }

    /**
     * @param {string} timeStr
     * @param {boolean} video
     */
    function mmssToSeconds(timeStr, video) {
        // 拆分字符串为 [分钟, 秒]

        let timeSegment = timeStr
        if (video === true) {


            timeSegment = timeStr.split('：')[1]
            timeSegment = timeSegment.split('，')[0]
        }

        const [minutesStr, secondsStr] = timeSegment.split(':');

        // 转换为数字（自动忽略前导零）
        const minutes = Number(minutesStr);
        const seconds = Number(secondsStr);
        // 计算总秒数
        return minutes * 60 + seconds;
    }

})


