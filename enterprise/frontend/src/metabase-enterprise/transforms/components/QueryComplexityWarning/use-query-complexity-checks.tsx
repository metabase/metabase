import { useCallback } from "react";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { useLazyCheckQueryComplexityQuery } from "metabase-enterprise/api";
import { CHECKPOINT_TEMPLATE_TAG } from "metabase-enterprise/transforms/constants";
import { getLibQuery, isMbqlQuery } from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DraftTransformSource } from "metabase-types/api";

import { QueryComplexityWarning } from "./QueryComplexityWarning";

const getQueryForComplexityCheck = (
  source: DraftTransformSource,
  metadata: Metadata,
): Lib.Query | undefined => {
  const query = getLibQuery(source, metadata);
  if (!query || isMbqlQuery(source, metadata)) {
    return;
  }

  const tags = Lib.templateTags(query);
  if (tags && CHECKPOINT_TEMPLATE_TAG in tags) {
    return;
  }

  return query;
};

export const useQueryComplexityChecks = () => {
  const [checkQueryComplexity] = useLazyCheckQueryComplexityQuery();
  const metadata = useSelector(getMetadata);
  const { modalContent: modal, show } = useConfirmation();

  const checkComplexity = useCallback(
    async (source: DraftTransformSource) => {
      const query = getQueryForComplexityCheck(source, metadata);
      if (!query) {
        return;
      }
      const rawQuery = Lib.rawNativeQuery(query) ?? "";
      const complexity = await checkQueryComplexity(rawQuery, true).unwrap();
      if (complexity.is_simple) {
        return;
      }
      return complexity;
    },
    [metadata, checkQueryComplexity],
  );

  const confirmIfQueryIsComplex = useCallback(
    async (
      source: DraftTransformSource,
      confirmButtonText: string = t`Save anyway`,
    ) => {
      const complexity = await checkComplexity(source);
      if (!complexity) {
        return true;
      }
      return new Promise<boolean>((resolve) => {
        show({
          title: t`Can't automatically run this transform incrementally`,
          message: <QueryComplexityWarning complexity={complexity} />,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
          confirmButtonText,
          confirmButtonProps: { color: "saturated-red", variant: "filled" },
        });
      });
    },
    [checkComplexity, show],
  );

  return { confirmIfQueryIsComplex, checkComplexity, modal };
};
