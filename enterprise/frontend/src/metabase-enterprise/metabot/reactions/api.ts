import type {
  ApiEndpointMutation,
  ApiEndpointQuery,
} from "@reduxjs/toolkit/query";
import { t } from "ttag";

import { userApi } from "metabase/api";
import type { MetabotApiCallReaction } from "metabase-types/api";

import { sendWritebackMessageRequest, stopProcessingAndNotify } from "../state";

import type { ReactionHandler } from "./types";

const apiEndpointToRTKQueryMap: Record<
  string,
  ApiEndpointQuery<any, any> | ApiEndpointMutation<any, any>
> = {
  "POST /api/user": userApi.endpoints.createUser,
};

export const apiCall: ReactionHandler<MetabotApiCallReaction> = reaction => {
  return async ({ dispatch }) => {
    const { method, url, body } = reaction.api_call;

    const errorMsg = t`I can’t do that, unfortunately.`;
    const rtkEndpoint = apiEndpointToRTKQueryMap[`${method} ${url}`];
    if (!rtkEndpoint) {
      console.error(
        "Metabot does not have a matching endpoint to invoke",
        reaction,
      );
      dispatch(stopProcessingAndNotify(errorMsg));
      return;
    }

    try {
      const result = (await dispatch(rtkEndpoint.initiate(body))) as any;

      try {
        if (result.error) {
          await dispatch(
            sendWritebackMessageRequest(
              "Request failed for client for reason: " +
                JSON.stringify(result.error),
            ),
          );
          return;
        }
      } catch (error) {
        console.error("Metabot failed to write back: ", error);
        dispatch(stopProcessingAndNotify(errorMsg));
      }
    } catch (error) {
      console.error("Metabot failed to complete api request: ", error);
      dispatch(stopProcessingAndNotify(errorMsg));
    }
  };
};
