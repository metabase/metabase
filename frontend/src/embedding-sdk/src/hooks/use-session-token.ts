// import { useCallback, useEffect } from "react";
// import { useLocalStorage } from "react-use";
// import type { SDKConfigType } from "../config";
//
// export const useSessionToken = ({
//   jwtProviderUri,
// }: {
//   jwtProviderUri: SDKConfigType["jwtProviderUri"];
// }) => {
//   const [sessionToken, setSessionToken] = useLocalStorage<string | null>(
//     "MB_SESSION_TOKEN",
//   );
//   const [tokenExp, setTokenExp] = useLocalStorage<string | null>(
//     "MB_SESSION_EXP",
//   );
//
//   const fetchSessionToken = useCallback(async () => {
//     console.log("fetchSessionToken");
//     fetch(jwtProviderUri, {
//       method: "GET",
//       credentials: "include",
//     })
//       .then(response => response.json())
//       .then(response => {
//         setSessionToken(response.id);
//         setTokenExp(response.exp);
//
//         const delay = Number(response.exp) * 1000 - Date.now() - 60000;
//
//         if (delay > 0) {
//           setTimeout(fetchSessionToken, delay);
//         }
//       })
//       .catch(error => console.error("Failed to fetch session token:", error));
//   }, [jwtProviderUri, setSessionToken, setTokenExp]);
//
//   useEffect(() => {
//     fetchSessionToken();
//   }, [fetchSessionToken]);
//
//   useEffect(() => {
//     console.log({
//       sessionToken,
//       tokenExp,
//     });
//   }, [sessionToken, tokenExp]);
//
//   return {
//     sessionToken,
//     tokenExp,
//   };
// };

import { useCallback, useEffect, useState } from "react";
import type { SDKConfigType } from "../config";

export const useSessionToken = ({
  jwtProviderUri,
}: {
  jwtProviderUri: SDKConfigType["jwtProviderUri"];
}) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [tokenExp, setTokenExp] = useState<string | null>(null);

  const fetchSessionToken = useCallback(async () => {
    fetch(jwtProviderUri, {
      method: "GET",
      credentials: "include",
    })
      .then(response => response.json())
      .then(response => {
        setSessionToken(response.id);
        setTokenExp(response.exp);

        const delay = Number(response.exp) * 1000 - Date.now() - 60000;

        if (delay > 0) {
          setTimeout(() => {
            fetchSessionToken();
          }, delay);
        }
      })
      .catch(error => console.error("Failed to fetch session token:", error));
  }, [jwtProviderUri, setSessionToken, setTokenExp]);

  useEffect(() => {
    fetchSessionToken();
    // eslint-disable-next-line
  }, []);

  const resetSessionToken = () => {
    console.log("resetting session token")
    setSessionToken(null);
    setTokenExp(null);
  }

  return {
    sessionToken,
    tokenExp,
    resetSessionToken
  };
};
