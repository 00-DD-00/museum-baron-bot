import fetch from 'node-fetch';
import { MD5 } from "md5-js-tools";
import dotenv from 'dotenv';
dotenv.config();

const accessToken = process.env.accessToken;
const userId = process.env.userId;
async function hash(visit, museum_id){
    const k = [80, 74, 75, 122, 102, 49, 105, 73, 106, 85]
        .map(x => String.fromCharCode(x))
        .join('');

    const vgc = visit.map(x => x.toUpperCase()).sort();
    const type = museum_id ? '1' : '0';
    const actStr = `${type}_${museum_id || '0'}__${vgc.join('|')}__${k}`;

    return MD5.generate(actStr);

}
async function request(view_url, sign, vkTs, visiteeIds, museum_id) {
    const signGame = await hash(visiteeIds, museum_id);

    const body = {
        action: {
            sign: signGame,
            type: museum_id ? 1 : 0,
            ...(museum_id && { museumId: museum_id }),
            visitorGroupsClicked: visiteeIds,
        },
        params: {
            vk_access_token_settings: "",
            vk_app_id: 51428155,
            vk_are_notifications_enabled: 0,
            vk_is_app_user: 0,
            vk_is_favorite: 0,
            vk_language: "ru",
            vk_platform: "desktop_web",
            vk_ref: "other",
            vk_ts: vkTs,
            vk_user_id: userId,
        },
        sign,
        userId,
    };

    const res = await fetch("https://museumbaron.ispretty.fun/iterate", {
        headers: {
            accept: "*/*",
            "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "content-type": "application/json",
            "sec-ch-ua": '"Chromium";v="110", "Not A(Brand";v="24", "Google Chrome";v="110"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            Referer: view_url,
            "Referrer-Policy": "strict-origin-when-cross-origin",
        },
        body: JSON.stringify(body),
        method: "POST",
    });

    return await res.json();
}
async function getApiUrl() {
    const url = 'https://api.vk.com/method/apps.getEmbeddedUrl?v=5.131';
    const appId = 51428155;

    try {
        const response = await fetch(`${url}&app_id=${appId}&access_token=${accessToken}`);
        const { response: { view_url } } = await response.json();
        const urlS = new URL(view_url);
        const sign = urlS.searchParams.get("sign");
        const vkTs = urlS.searchParams.get("vk_ts");
        return { sign, vkTs, view_url };
    } catch (error) {
        console.error(`Скорее всего вы ввели не правильный accessToken`);
        throw error;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function main() {
    const apiUrl = await getApiUrl();
    const museumRes = await fetch("https://museumbaron.ispretty.fun/museums", {"method": "GET"});
    const museum_json = await museumRes.json();
    const museumMap = new Map(museum_json.map(m => [m.id.toString(), m.cost]));

    while (true) {
        const resultPromise = request(apiUrl.view_url, apiUrl.sign, apiUrl.vkTs, []);
        const visiteeIdsPromise = resultPromise.then(result => result.visitorGroups.map(group => group.id));
        const fPersPromise = visiteeIdsPromise.then(visiteeIds => request(apiUrl.view_url, apiUrl.sign, apiUrl.vkTs, visiteeIds));
        // const ratingPromise = fetch(`https://museumbaron.ispretty.fun/rating?userId=${userId}`);
        const [result, fPers, raiting_json] = await Promise.all([resultPromise, fPersPromise, ratingPromise]);

        const arr = Object.keys(fPers.museumsBuilt);
        for (const id of museumMap.keys()) {
            if (!arr.includes(id)) {
                const cost = museumMap.get(id);
                if (fPers.totalMoney >= cost) {
                    fPers.totalMoney -= cost;
                    console.log(`Куплено ${id}\nОсталось денег: ${fPers.totalMoney}\n\n\n`);
                    await request(apiUrl.view_url, apiUrl.sign, apiUrl.vkTs, [], id);
                    break;
                } else {
                    console.log(`Денег: ${fPers.totalMoney}\nОсталось до след.покупки: ${cost - fPers.totalMoney}\nПолучаем: ${fPers.incomePerSecond}/сек\n\n\n`);
                    break;
                }
            }
        }

        await sleep(2000);
    }
}


main();