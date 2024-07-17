import dotenv from 'dotenv'
// 加载环境变量
dotenv.config()
const env = dotenv.config().parsed // 环境参数

// 从环境变量中导入机器人的名称
const botName = env.BOT_NAME

// 从环境变量中导入联系人白名单
const aliasWhiteList = env.ALIAS_WHITELIST ? env.ALIAS_WHITELIST.split(',') : []

// 从环境变量中导入群聊白名单
const roomWhiteList = env.ROOM_WHITELIST ? env.ROOM_WHITELIST.split(',') : []

import {getServe} from './serve.js'

/**
 * 默认消息发送
 * @param msg
 * @param bot
 * @param ServiceType 服务类型 'GPT' | 'Kimi'
 * @returns {Promise<void>}
 */
export async function defaultMessage(msg, bot, ServiceType = 'GPT') {
    const getReply = getServe(ServiceType)
    const contact = msg.talker() // 发消息人
    const receiver = msg.to() // 消息接收人
    const content = msg.text() // 消息内容
    const room = msg.room() // 是否是群消息
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
    console.log('-----------------------------------')
    console.log('contact:', contact.payload.name)
    console.log('room=', room !== undefined, ',roomName=', roomName)
    console.log('content=', realContent)

    const helpResponse =  "🌸 欢迎使用肥燕机器人 🌸 \n" +
        "在群聊使用时记得艾特我，要不然没反应\n" +
        "1.请求 AI 模型输入【ai-问题】，如：ai-番茄炒鸡蛋怎么做\n"+
        "1.请求 AI 模型输入【ai-问题】，如：ai-番茄炒鸡蛋怎么做\n"

    try {
        const doType4 = realContent.substring(0, 4)
        const doType3 = realContent.substring(0, 3)
        const doType2 = realContent.substring(0, 2)
        switch (doType4) {
            case "help":
                if (room) {
                    await room.say(helpResponse)
                } else {
                    await contact.say(helpResponse)
                }
                return
        }

        switch (doType3) {

        }

        switch (doType2) {
            case "ai":
                realContent = realContent.slice(3)
                const response = await getReply(realContent)
                console.log(response)
                if (room) {
                    await room.say(response)
                } else {
                    await contact.say(response)
                }
                return
        }
        if (room) {
            await room.say(helpResponse)
        } else {
            await contact.say(helpResponse)
        }
    } catch (e) {
        console.error(e)
    }
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
