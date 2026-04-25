import {readFile, writeFile} from "node:fs/promises";
/**
 * 如果key不存在，json是一个数组
 * */
export async function appendToJson(filePath: string, value: any, key?: string) {
    let currentData: object|Array<object>;
    try {
        // 尝试读取现有文件
        const fileContent = await readFile(filePath, 'utf-8');
        currentData= JSON.parse(fileContent);
    } catch (e) {
        if(key){
            currentData={}
        }else{
            currentData=[]
        }

    }

    if(Array.isArray(currentData)){
        currentData.push(value)
    }else{
        currentData[key] = value;
    }



    // 写入文件
    await writeFile(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
}