import dotenv from 'dotenv'
import {v4 as uuidV4} from 'uuid'
// 加载环境变量
dotenv.config()
const env = dotenv.config().parsed // 环境参数

// 从环境变量中导入机器人的名称
const botName = env.BOT_NAME
const botRealName = env.BOT_REAL_NAME
const taskKey = "timeTask"

// 从环境变量中导入联系人白名单
const aliasWhiteList = env.ALIAS_WHITELIST ? env.ALIAS_WHITELIST.split(',') : []

// 从环境变量中导入群聊白名单
const roomWhiteList = env.ROOM_WHITELIST ? env.ROOM_WHITELIST.split(',') : []

import {getServe} from './serve.js'
import {DataStore} from './saveJson.js'

/**
 * 默认消息发送
 * @param msg
 * @param bot
 * @param ServiceType 服务类型 'GPT' | 'Kimi'
 * @returns {Promise<void>}
 */
export async function defaultMessage(msg, bot, ServiceType = 'GPT') {
    // const getReply = getServe(ServiceType)
    const contact = msg.talker() // 发消息人
    const receiver = msg.to() // 消息接收人
    const content = msg.text() // 消息内容
    const room = msg.room() // 是否是群消息
    const roomId = (await room?.id) || null // 群id
    const roomName = (await room?.topic()) || null // 群名称
    const alias = (await contact.alias()) || (await contact.name()) // 发消息人昵称
    const remarkName = await contact.alias() // 备注名称
    const name = await contact.name() // 微信名称
    const isText = msg.type() === bot.Message.Type.Text // 消息类型是否为文本
    const isRoom = roomWhiteList.includes(roomName) && content.includes(`${botName}`) // 是否在群聊白名单内并且艾特了机器人
    const isAlias = aliasWhiteList.includes(remarkName) || aliasWhiteList.includes(name) // 发消息的人是否在联系人白名单内
    const isBotSelf = botName === remarkName || botName === name // 是否是机器人自己

    if (isBotSelf || !isText) return // 如果是机器人自己发送的消息或者消息类型不是文本则不处理

    // 如果是群聊并且不是白名单并且没有艾特机器人
    if (room && !isRoom) {
        return
    }

    // 如果是单聊并且不是白名单
    if (!room && !isAlias) {
        return
    }

    let realContent = content

    if (isRoom && room) {
        realContent = (await msg.mentionText()) || content.replace(`${botName}`, '') // 去掉艾特的消息主体
    }
    // console.log('-----------------------------------')
    // console.log('contact:', contact.payload)
    // console.log('room=', room)
    // console.log('content=', realContent)
    // console.log('contact.payload', contact.payload)

    const helpResponse = "🌸 欢迎使用肥燕机器人 🌸 \n" +
        "在群聊使用时记得艾特我，要不然没反应\n" +
        "1.请求AI模型输入【ai-问题】，如：ai-番茄炒鸡蛋怎么做\n" +
        "2.定时提醒输入【time-时间-提醒事项】，时间格式:2024-07-15-11-11-11，如：time-2024-07-15-08-15-00-提醒我解冻牛肉\n"

    try {
        const doType4 = realContent.substring(0, 4)
        const doType3 = realContent.substring(0, 3)
        const doType2 = realContent.substring(0, 2)
        switch (doType4) {
            case "help":
                await response(room, contact, helpResponse)
                return

            case "time":
                await response(room, contact, timeTaskResponse(realContent, room, roomId, contact))
                return
        }

        switch (doType3) {

        }

        switch (doType2) {
            case "ai":
                realContent = realContent.slice(3)
                const aiRes = await getReply(realContent)
                await response(room, contact, aiRes)
                return
        }

        // 判断是否回复机器人的话
        const botNameLen = botRealName.length
        const matchStr = '「' + botRealName + '：'
        if (realContent.substring(0, botNameLen + 2) === matchStr) {
            realContent = realContent.replaceAll(`\n`, '')
            console.log('回复模式', realContent)
            realContent = realContent.slice(botNameLen + 2)
            if (realContent.substring(0, 6) === 'timer:') {
                realContent = realContent.slice(6)
                let arr = realContent.split('~')
                if (arr.length < 2) {
                    console.log('定时任务关闭失败', realContent)
                    return
                }
                const store = new DataStore('task.json');
                let taskMap = store.get(taskKey)
                let newArr = []

                for (const taskMapKey in taskMap) {
                    let id = arr[arr.length - 1].slice(0, 36)
                    if (taskMap[taskMapKey]['id'] === id) {
                        console.log('定时任务已删除：', id)
                    } else {
                        newArr.push(taskMap[taskMapKey])
                    }
                }
                store.add(taskKey, newArr)
                await response(room, contact, '好的收到')
            }
            return
        }


        await response(room, contact, helpResponse)
    } catch (e) {
        console.error(e)
    }
}


export async function response(room, contact, res) {
    if (room) {
        await room.say(res)
    } else {
        await contact.say(res)
    }
}

function timeTaskResponse(realContent, room, roomId, contact) {
    realContent = realContent.slice(5)
    let arr = realContent.split('-')
    if (arr.length < 6) {
        return '您的格式有误，请重新输入'
    }
    let dateStr = arr[0] + '-' + arr[1] + '-' + arr[2] + ' ' + arr[3] + ':' + arr[4] + ':' + arr[5]
    // console.log(dateStr)
    let time = Date.parse(dateStr) / 1000
    const newArr = arr.slice(6, arr.length)
    let notice = newArr.join('')

    const store = new DataStore('task.json');
    let taskMap = store.get(taskKey)
    if (!taskMap) {
        taskMap = []
    }
    taskMap.push({
        'id': uuidV4(),
        "isRoom": room !== undefined,
        "roomId": roomId,
        "talkId": contact.payload.id,
        "time": time,
        "notice": notice,
        "sendNum": 0,
    })
    store.add(taskKey, taskMap);
    return '我会在' + dateStr + "提醒您：" + notice
}

/**
 * 分片消息发送
 * @param message
 * @param bot
 * @returns {Promise<void>}
 */
export async function shardingMessage(message, bot) {
    const talker = message.talker()
    const isText = message.type() === bot.Message.Type.Text // 消息类型是否为文本
    if (talker.self() || message.type() > 10 || (talker.name() === '微信团队' && isText)) {
        return
    }
    const text = message.text()
    const room = message.room()
    if (!room) {
        console.log(`Chat GPT Enabled User: ${talker.name()}`)
        const response = await getChatGPTReply(text)
        await trySay(talker, response)
        return
    }
    let realText = splitMessage(text)
    // 如果是群聊但不是指定艾特人那么就不进行发送消息
    if (text.indexOf(`${botName}`) === -1) {
        return
    }
    realText = text.replace(`${botName}`, '')
    const topic = await room.topic()
    const response = await getChatGPTReply(realText)
    const result = `${realText}\n ---------------- \n ${response}`
    await trySay(room, result)
}

// 分片长度
const SINGLE_MESSAGE_MAX_SIZE = 500

/**
 * 发送
 * @param talker 发送哪个  room为群聊类 text为单人
 * @param msg
 * @returns {Promise<void>}
 */
async function trySay(talker, msg) {
    const messages = []
    let message = msg
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
        messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE))
        message = message.slice(SINGLE_MESSAGE_MAX_SIZE)
    }
    messages.push(message)
    for (const msg of messages) {
        await talker.say(msg)
    }
}

/**
 * 分组消息
 * @param text
 * @returns {Promise<*>}
 */
async function splitMessage(text) {
    let realText = text
    const item = text.split('- - - - - - - - - - - - - - -')
    if (item.length > 1) {
        realText = item[item.length - 1]
    }
    return realText
}
