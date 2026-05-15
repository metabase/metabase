"use strict";
this["webpackHotUpdatemetabase_embed"]("main", {
"./enterprise/frontend/src/embedding/auth-common/jwt.ts": 
/*!**************************************************************!*\
  !*** ./enterprise/frontend/src/embedding/auth-common/jwt.ts ***!
  \**************************************************************/
(function (__unused_webpack_module, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
__webpack_require__.d(__webpack_exports__, {
  jwtDefaultRefreshTokenFunction: function() { return jwtDefaultRefreshTokenFunction; }
});
/* ESM import */var embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! embedding-sdk-bundle/errors */ "./frontend/src/embedding-sdk-bundle/errors/index.ts");

async function jwtDefaultRefreshTokenFunction(responseUrl, instanceUrl, requestHeaders, customFetchRequestToken = null) {
    const jwtTokenResponse = await runFetchRequestToken(responseUrl, customFetchRequestToken);
    const mbAuthUrl = `${instanceUrl}/auth/sso`;
    let authSsoResponse;
    try {
        authSsoResponse = await fetch(mbAuthUrl, {
            method: "POST",
            headers: {
                ...requestHeaders,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                jwt: jwtTokenResponse
            })
        });
    } catch (e) {
        // Network error when connecting to Metabase SSO
        throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.CANNOT_FETCH_JWT_TOKEN({
            url: mbAuthUrl,
            message: e instanceof Error ? e.message : String(e)
        });
    }
    if (!authSsoResponse.ok) {
        // HTTP status error from Metabase SSO
        throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.CANNOT_FETCH_JWT_TOKEN({
            url: mbAuthUrl,
            status: String(authSsoResponse.status)
        });
    }
    try {
        // Attempt to parse JSON response
        return await authSsoResponse.json();
    } catch (ex) {
        // JSON parsing error from Metabase SSO
        // Although the requirement was specific about CUSTOM/DEFAULT for the first fetch,
        // it's reasonable to use a specific error for parsing the *Metabase* response too.
        // If a more general error is preferred here, we can adjust.
        throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.DEFAULT_ENDPOINT_ERROR({
            actual: ex instanceof Error ? ex.message : String(ex)
        });
    }
}
const runFetchRequestToken = async (responseUrl, customFetchRequestToken = null)=>{
    // Points to the JWT Auth endpoint on the client server
    // This should return {jwt: USER_JWT_TOKEN } with the signed token from the client backend
    try {
        const clientBackendResponse = customFetchRequestToken ? await customFetchRequestToken() : await refreshUserJwt(responseUrl);
        if (typeof clientBackendResponse !== "object" || !("jwt" in clientBackendResponse)) {
            const actualResponse = JSON.stringify(clientBackendResponse);
            if (customFetchRequestToken) {
                throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.CUSTOM_FETCH_REQUEST_TOKEN_ERROR({
                    expected: "{ jwt: string }",
                    actual: actualResponse
                });
            }
            throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.DEFAULT_ENDPOINT_ERROR({
                actual: actualResponse
            });
        }
        const jwtTokenResponse = clientBackendResponse.jwt;
        return jwtTokenResponse;
    } catch (e) {
        console.error(e);
        throw e;
    }
};
const refreshUserJwt = async (url)=>{
    let clientBackendResponse;
    try {
        // Use window.location.origin as base to support relative URLs like "/api/sso"
        const urlWithSource = new URL(url, window.location.origin);
        urlWithSource.searchParams.set("response", "json");
        clientBackendResponse = await fetch(urlWithSource.toString(), {
            method: "GET",
            credentials: "include"
        });
    } catch (e) {
        // Network error
        throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.CANNOT_FETCH_JWT_TOKEN({
            url,
            message: e instanceof Error ? e.message : String(e)
        });
    }
    if (!clientBackendResponse.ok) {
        // HTTP status error
        throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.CANNOT_FETCH_JWT_TOKEN({
            url,
            status: String(clientBackendResponse.status)
        });
    }
    const text = await clientBackendResponse.text();
    // This should return { jwt: "<signed-token>" } from the customer's auth provider
    try {
        return JSON.parse(text);
    } catch (e) {
        // JSON parsing error
        throw embedding_sdk_bundle_errors__WEBPACK_IMPORTED_MODULE_0__.DEFAULT_ENDPOINT_ERROR({
            actual: `"${text}"`
        });
    }
};


}),

},function(__webpack_require__) {
// webpack/runtime/get_full_hash
!function() {
__webpack_require__.h = function() { return "a0244db7b75963b9"; }
}();

}
);