//豆包
const personal_config = {
    PAGE_URL:
        'https://nbuyjs.yuketang.cn/pro/lms/CSs3mnBmJ7Y/28403852/studycontent',
}
const model_doubao = {

    API_KEY:
        '',
    MODEL_ID:
        'ep-m-20251126120953-vzcvr',
    MODEL_URL:
        'https://ark.cn-beijing.volces.com/api/v3/chat/completions'

}
const model_deepseek = {

    API_KEY:
        '',
    MODEL_ID:
        'deepseek-chat',
    MODEL_URL:
        'https://api.deepseek.com/chat/completions'

}
const politics_exam_global_config = {

    PROMPT: '根据选择题和判断题内容给出回复，如果是单选题直接给出大写字母，多选题给出字母字符串用&分割，例如单选题答案是C,只给出“C”,多选题是ABE，给出“A&B&E”；如果是判断题，只能正确给出‘Y’,错误给出“W”，即使判断题中出现正确“A”,错误"B",依然要给出"Y"或"W"。所有题除了&和英文字母不要有任何其他符号。由于文字来自于OCR，识别率并不一定精准，如果有缺失内容，可以猜测文本内容从给出一个正确的答案。多选题首先判断有几个选项，例如题目包含五项原则，但是只有四个选项，绝对不能给出“E”选项，确保给出的字母选项不要超出选项的数量，以免发生错误，但是多选题一定要给出多个选项，而不是单个选项。如果涉及到法律法规结果不能给出，给出“&”',
}
export const politics_exam_config = {...model_doubao, ...politics_exam_global_config, ...personal_config}