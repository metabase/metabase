import { t } from "ttag";
import { useEffect, useReducer } from "react";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
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
    default: {
      const _exhaustiveCheck: never = action;
      throw Error(
        "Unknown action dispatched in useBilling:" +
          JSON.stringify(_exhaustiveCheck),
      );
    }
  }
}

export const useBillingInfo = (isTokenValid: boolean): UseBillingState => {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const isEE = PLUGIN_EMBEDDING.isEnabled();

  useEffect(() => {
    let cancelled = false;

    const fetchBillingInfo = async () => {
      dispatch({ type: "SET_LOADING" });

      try {
        const billingResponse = await StoreApi.billingInfo();
        if (!cancelled) {
          dispatch({ type: "SET_DATA", payload: billingResponse });
        }
      } catch (err: any) {
        if (!cancelled) {
          dispatch({ type: "SET_ERROR", payload: t`An error occurred` });
        }
      }
    };

    if (isEE && isTokenValid) {
      fetchBillingInfo();
    }

    return () => {
      cancelled = true;
    };
  }, [isTokenValid, isEE]);

  return state;
};
