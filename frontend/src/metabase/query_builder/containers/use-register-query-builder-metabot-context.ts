import { useEffect, useRef } from "react";

import { useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  getBase64ChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

import { getIsLoadingComplete, getQuestion } from "../selectors";

export const useRegisterQueryBuilderMetabotContext = () => {
  const question = useSelector(getQuestion);
  const isLoadingComplete = useSelector(getIsLoadingComplete);
  const chartImageRef = useRef<string | undefined>();

  // Capture chart image when loading is complete
  useEffect(() => {
    if (!question || !isLoadingComplete) {
      return;
    }

    // Small delay to ensure visualization has rendered
    const timeout = setTimeout(async () => {
      try {
        const imageBase64 = await getBase64ChartImage(
          getChartSelector({ cardId: question.id() }),
        );
        chartImageRef.current = imageBase64;
      } catch (error) {
        console.warn("Failed to capture chart image:", error);
        chartImageRef.current = undefined;
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [question, isLoadingComplete]);

  useRegisterMetabotContextProvider((state) => {
    const question = getQuestion(state);
    if (!question) {
      return {};
    }

    const baseContext = question.isSaved()
      ? {
          type: question.type(),
          id: question.id(),
          query: question.datasetQuery(),
        }
      : { type: "adhoc" as const, query: question.datasetQuery() };

    // Only include chart_config if we have an image
    const contextWithImage = chartImageRef.current
      ? {
          ...baseContext,
          chart_configs: [{ image_base_64: chartImageRef.current }],
        }
      : baseContext;

    return {
      user_is_viewing: [contextWithImage],
    };
  }, []);
};
