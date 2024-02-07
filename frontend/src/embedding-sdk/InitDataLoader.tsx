import {memo, useEffect, useState} from "react";
import {refreshCurrentUser} from "metabase/redux/user";
import {reloadSettings} from "metabase/admin/settings/settings";
import registerVisualizations from "metabase/visualizations/register";
import {useDispatch} from "metabase/lib/redux";
import api from "metabase/lib/api";
import {getSessionToken} from "./utils";
import type {SDKConfigType} from "./config";


interface InitDataLoaderProps {
    apiUrl: SDKConfigType["metabaseInstanceUrl"];
    jwtProviderUri: SDKConfigType["jwtProviderUri"]
    onInitialize: () => void;
    onLogin: (isLoggedIn: boolean) => void;
}

const InitDataLoaderInternal = ({
                                    apiUrl,
    jwtProviderUri,
                                    onInitialize,
                                    onLogin,
                                }: InitDataLoaderProps): JSX.Element | null => {

    const [sessionToken, setSessionToken] = useState<string | null>(null);


    const dispatch = useDispatch();

    useEffect(() => {
        registerVisualizations();
    }, []);

    useEffect(() => {
        getSessionToken(jwtProviderUri).then(response => setSessionToken(response.response.token.id));
    }, [jwtProviderUri]);

    useEffect(() => {
        if (sessionToken && apiUrl) {
            api.basename = apiUrl;
            api.sessionToken = sessionToken;

            Promise.all([
                dispatch(refreshCurrentUser()),
                dispatch(reloadSettings()),
            ]).then(() => {
                onInitialize();
                onLogin(true);
            });
        } else {
            onLogin(false);
        }
    }, [apiUrl, dispatch, onInitialize, onLogin, sessionToken]);

    return null;
};

export const InitDataLoader = memo(InitDataLoaderInternal);
