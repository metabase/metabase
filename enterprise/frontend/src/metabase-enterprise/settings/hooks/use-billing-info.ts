import { useEffect, useReducer } from "react";

import { StoreApi } from "metabase/services";
import type { BillingInfo } from "metabase-types/api";

type UseBillingAction =
  | { type: "SET_LOADING" }
  | { type: "SET_ERROR" }
  | { type: "SET_DATA"; payload: BillingInfo };

type UseBillingState =
  | { loading: false; error: false; billingInfo: undefined }
  | { loading: true; error: false; billingInfo: undefined }
  | { loading: false; error: true; billingInfo: undefined }
  | { loading: false; error: false; billingInfo: BillingInfo };

const defaultState: UseBillingState = {
  loading: false,
  error: false,
  billingInfo: undefined,
};

function reducer(
  _state: UseBillingState,
  action: UseBillingAction,
): UseBillingState {
  switch (action.type) {
    case "SET_LOADING":
      return { loading: true, error: false, billingInfo: undefined };
    case "SET_ERROR":
      return { loading: false, error: true, billingInfo: undefined };
    case "SET_DATA":
      return { loading: false, error: false, billingInfo: action.payload };
    default: {
      const _exhaustiveCheck: never = action;
      throw Error(
        "Unknown action dispatched in useBilling:" +
          JSON.stringify(_exhaustiveCheck),
      );
    }
  }
}

export const useBillingInfo = (
  shouldFetchBillingInfo: boolean,
): UseBillingState => {
  const [state, dispatch] = useReducer(reducer, defaultState);

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
          dispatch({ type: "SET_ERROR" });
        }
      }
    };

    if (shouldFetchBillingInfo) {
      fetchBillingInfo();
    }

    return () => {
      cancelled = true;
    };
  }, [shouldFetchBillingInfo]);

  return state;
};
