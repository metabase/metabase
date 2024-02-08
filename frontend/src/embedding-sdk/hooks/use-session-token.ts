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

import { useCallback, useEffect } from "react";
import { useLocalStorage } from "react-use";
import type { SDKConfigType } from "../config";

export const useSessionToken = ({
  jwtProviderUri,
}: {
  jwtProviderUri: SDKConfigType["jwtProviderUri"];
}) => {
  const [sessionToken, setSessionToken] = useLocalStorage<string | null>(
    "MB_SESSION_TOKEN",
  );
  const [tokenExp, setTokenExp] = useLocalStorage<string | null>(
    "MB_SESSION_EXP",
  );

  const fetchSessionToken = useCallback(async () => {
    console.log("Starting fetchSessionToken at:", new Date().toISOString());
    fetch(jwtProviderUri, {
      method: "GET",
      credentials: "include",
    })
      .then(response => response.json())
      .then(response => {
        console.log("API call completed at:", new Date().toISOString());
        setSessionToken(response.id);
        setTokenExp(response.exp);

        const delay = Number(response.exp) * 1000 - Date.now() - 60000;
        console.log(`Setting timeout for next fetch in ${delay}ms`);

        if (delay > 0) {
          setTimeout(() => {
            console.log(
              "Timeout callback executing at:",
              new Date().toISOString(),
            );
            fetchSessionToken();
          }, delay);
        }
      })
      .catch(error => console.error("Failed to fetch session token:", error));
  }, [jwtProviderUri, setSessionToken, setTokenExp]);

  useEffect(() => {
    console.log(
      "useEffect for fetchSessionToken triggered at:",
      new Date().toISOString(),
    );
    fetchSessionToken();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    console.log("Session token or expiration changed:", {
      sessionToken,
      tokenExp,
    });
  }, [sessionToken, tokenExp]);

  // Additional logging to track component renders
  console.log("Component render or re-render at:", new Date().toISOString(), {
    jwtProviderUri,
  });

  return {
    sessionToken,
    tokenExp,
  };
};
