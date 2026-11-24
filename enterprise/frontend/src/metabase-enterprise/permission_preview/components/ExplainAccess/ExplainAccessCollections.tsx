import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex, Icon, Stack, Tooltip, UnstyledButton } from "metabase/ui";
import { useGetPermissionDebugAccessQuery } from "metabase-enterprise/api";
import type { PermissionDebugCollection, UserId } from "metabase-types/api";

import type { PreviewTarget } from "../types";

import type { ExplainDetail } from "./ExplainAccessDetail";
import {
  BodyText,
  Row,
  SheetCard,
  StatusButton,
  SummaryLink,
  VerdictLine,
} from "./ExplainAccessParts";
import {
  getCollectionName,
  getCollectionVerdict,
  getSourceText,
  getSubject,
} from "./explain";
import { getCollectionStatus } from "./labels";

interface CollectionSheetProps {
  collection?: PermissionDebugCollection;
  target: PreviewTarget;
  onOpenDetail: (detail: ExplainDetail) => void;
  onOpenSummary: () => void;
}

/** One collection: whether the person can open it, in a line, with the status that opens the reason. */
export function CollectionSheet({
  collection,
  target,
  onOpenDetail,
  onOpenSummary,
}: CollectionSheetProps) {
  const subject = getSubject(target);

  return (
    <Stack gap="xl">
      {collection ? (
        <Flex align="center" justify="space-between" gap="sm" wrap="nowrap">
          <Flex align="center" gap="xs" wrap="nowrap" miw={0}>
            <CollectionVerdict
              collection={collection}
              text={getCollectionVerdict(subject, collection)}
            />
          </Flex>
          <StatusButton
            status={getCollectionStatus(collection.value)}
            rowName={getCollectionName(collection, target)}
            withIcon={false}
            onClick={() => onOpenDetail({ kind: "collection", collection })}
          />
        </Flex>
      ) : (
        <Flex gap="sm" align="center" c="text-secondary">
          <Icon name="info" />
          <BodyText c="text-secondary">
            {t`No collection permissions apply to this page.`}
          </BodyText>
        </Flex>
      )}
      <SummaryLink subject={subject} onClick={onOpenSummary} />
    </Stack>
  );
}

interface CollectionVerdictProps {
  collection: PermissionDebugCollection;
  text: string;
}

function CollectionVerdict({ collection, text }: CollectionVerdictProps) {
  const status = getCollectionStatus(collection.value);

  return (
    <>
      <VerdictLine icon={status.icon} color={status.color}>
        {text}
      </VerdictLine>
      <Tooltip
        multiline
        w="20rem"
        label={t`People get the most permissive collection access across all of their groups. Dashboards and questions in this collection get the same access. Open a dashboard or question to see which tables they use.`}
      >
        <UnstyledButton
          display="flex"
          c="text-secondary"
          aria-label={t`About collection permissions`}
        >
          <Icon name="info" />
        </UnstyledButton>
      </Tooltip>
    </>
  );
}

interface AllCollectionsSheetProps {
  userId: UserId;
  target: PreviewTarget;
  onOpenDetail: (detail: ExplainDetail) => void;
  onOpenSummary: () => void;
}

/** All collections: the ones the person can open at the top, each with its status. */
export function AllCollectionsSheet({
  userId,
  target,
  onOpenDetail,
  onOpenSummary,
}: AllCollectionsSheetProps) {
  const { currentData, error, isFetching } = useGetPermissionDebugAccessQuery({
    "user-id": userId,
  });
  const collections = (currentData?.collections ?? [])
    .filter(({ location, value }) => location === "/" && value !== "none")
    .sort(
      (first, second) =>
        Number(first["personal?"]) - Number(second["personal?"]),
    );

  return (
    <Stack gap="xl">
      <LoadingAndErrorWrapper
        loading={isFetching}
        error={error ? t`Couldn't explain this access.` : null}
      >
        <SheetCard title={t`Collections`}>
          {collections.map((collection) => {
            const name = getCollectionName(collection, target);
            return (
              <Row
                key={collection["collection-id"]}
                name={name}
                detail={
                  collection["by-rule"]
                    ? null
                    : getSourceText(collection.groups)
                }
              >
                <StatusButton
                  status={getCollectionStatus(collection.value)}
                  rowName={name}
                  onClick={() =>
                    onOpenDetail({ kind: "collection", collection })
                  }
                />
              </Row>
            );
          })}
        </SheetCard>
      </LoadingAndErrorWrapper>
      <SummaryLink subject={getSubject(target)} onClick={onOpenSummary} />
    </Stack>
  );
}
