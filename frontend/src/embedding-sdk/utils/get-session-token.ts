import type {SDKConfigType} from "../config";

export const getSessionToken = async (jwtProviderUri: SDKConfigType["jwtProviderUri"]): Promise<{
    message: string,
    response: {
        token: {
            id: string,
        }
    },
    status: string
}> => {
    const response = await fetch(jwtProviderUri, {
        method: "GET",
        credentials: "include",
    })
    return await response.json()
}