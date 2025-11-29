//也可以使用自己的大模型api 结构类似于下面，并修改export，由于并不是所有的api请求都一样，如有错误可以修改原文res对象结构
//豆包
const politics_exam_config_doubao = {

    API_KEY:
        '',//TODO:APIKEY
    MODEL_ID:
        'ep-m-20251126120953-vzcvr',
    MODEL_URL:
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

}
const politics_exam_config_deepseek = {

    API_KEY:
        '',//TODO:APIKEY
    MODEL_ID:
        'deepseek-chat',
    MODEL_URL:
        'https://api.deepseek.com/chat/completions'

}
const politics_exam_global_config = {
    PAGE_URL:
        '',//TODO:雨课堂链接
    PROMPT: '根据选择题和判断题内容给出回复，如果是单选题直接给出大写字母，多选题给出字母字符串用&分割，例如单选题答案是C,只给出“C”,多选题是ABE，给出“A&B&E”，如果是判断题，正确给出‘Y’,错误给出“W”，,除了&和英文字母不要有任何其他符号，由于文字来自于OCR，识别率并不一定精准，如果有缺失内容，可以猜测文本内容尽量给出一个正确的答案，如果涉及到法律法规结果未知不能给出，给出“&”',
}
export const politics_exam_config = {...politics_exam_config_doubao, ...politics_exam_global_config}