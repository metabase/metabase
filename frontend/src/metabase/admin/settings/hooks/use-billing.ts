import { t } from "ttag";
import { useEffect, useReducer } from "react";
import { StoreApi } from "metabase/services";
import type { BillingInfo } from "metabase-types/api";

type UseBillingAction =
  | { type: "SET_LOADING" }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_DATA"; payload: BillingInfo };

type UseBillingState =
  | { loading: false; error: undefined; billingInfo: undefined }
  | { loading: true; error: undefined; billingInfo: undefined }
  | { loading: false; error: string; billingInfo: undefined }
  | { loading: false; error: undefined; billingInfo: BillingInfo };

const defaultState: UseBillingState = {
  loading: false,
  error: undefined,
  billingInfo: undefined,
};

function reducer(
  _state: UseBillingState,
  action: UseBillingAction,
): UseBillingState {
  switch (action.type) {
    case "SET_LOADING":
      return { loading: true, error: undefined, billingInfo: undefined };
    case "SET_ERROR":
      return { loading: false, error: action.payload, billingInfo: undefined };
    case "SET_DATA":
      return { loading: false, error: undefined, billingInfo: action.payload };
    default:
      throw Error("Unknown action dispatched in useBilling");
  }
}

export const useBilling = (token: string): UseBillingState => {
  const [state, dispatch] = useReducer(reducer, defaultState);

  useEffect(() => {
    let cancelled = false;

    const fetchBillingInfo = async () => {
      dispatch({ type: "SET_LOADING" });

      try {
        // TODO: send along token, email, lang? what to do if MB_PREMIUM_EMBEDDING_TOKEN is being used + there's no token
        const billingResponse = (await StoreApi.billingInfo()) as BillingInfo;
        if (!cancelled) {
          dispatch({ type: "SET_DATA", payload: billingResponse });
        }
      } catch (err: any) {
        const msg = err?.message || err?.toString() || t`An error occurred`;
        dispatch({ type: "SET_ERROR", payload: msg });
      }
    };

    if (token) {
      fetchBillingInfo();
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
};
