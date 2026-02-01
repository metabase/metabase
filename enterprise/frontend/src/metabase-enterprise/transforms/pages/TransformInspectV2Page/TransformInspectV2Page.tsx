import { useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Button, Center, Divider, Flex, Stack, Tabs, Text } from "metabase/ui";
import {
  useGetInspectorDiscoveryQuery,
  useGetTransformInspectQuery,
  useGetTransformQuery,
} from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import type {
  InspectorDiscoveryResponse,
  TransformId,
} from "metabase-types/api";

import { TransformHeader } from "../../components/TransformHeader";
import {
  InspectColumnComparisons,
  InspectJoins,
  InspectSummary,
} from "../TransformInspectPage/components";

import { LensContent } from "./components/LensContent";

type TransformInspectV2PageParams = {
  transformId: string;
};

type TransformInspectV2PageProps = {
  params: TransformInspectV2PageParams;
};

export const TransformInspectV2Page = ({
  params,
}: TransformInspectV2PageProps) => {
  const transformId = Urls.extractEntityId(params.transformId);
  const [activeTab, setActiveTab] = useState<string | null>("v2");

  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);

  const {
    data: discovery,
    isLoading: isLoadingDiscovery,
    error: discoveryError,
  } = useGetInspectorDiscoveryQuery(transformId ?? skipToken);

  const {
    data: inspectDataV1,
    isLoading: isLoadingInspectV1,
    error: inspectErrorV1,
  } = useGetTransformInspectQuery(transformId ?? skipToken);

  const isLoading = isLoadingTransform || isLoadingDiscovery;
  const error = transformError ?? discoveryError;

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (discovery == null || discovery.status === "not-run") {
    return (
      <PageContainer data-testid="transform-inspect-v2-content">
        <TransformHeader transform={transform} />
        <Center h="100%" style={{ flex: 1 }}>
          <Stack align="center" gap="md">
            <Text c="text-secondary">
              {t`To inspect the transform you need to run it first.`}
            </Text>
            <Button component={Link} to={Urls.transformRun(transform.id)}>
              {t`Go to Run`}
            </Button>
          </Stack>
        </Center>
      </PageContainer>
    );
  }

  return (
    <PageContainer data-testid="transform-inspect-v2-content">
      <TransformHeader transform={transform} />
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="v2">{t`Inspector V2`}</Tabs.Tab>
          <Tabs.Tab value="v1">{t`Inspector V1`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="v2" pt="md">
          <AllLensesContent transformId={transformId!} discovery={discovery} />
        </Tabs.Panel>

        <Tabs.Panel value="v1" pt="md">
          {isLoadingInspectV1 || inspectErrorV1 ? (
            <Center h={200}>
              <LoadingAndErrorWrapper
                loading={isLoadingInspectV1}
                error={inspectErrorV1}
              />
            </Center>
          ) : inspectDataV1 ? (
            <Stack gap="xl">
              {inspectDataV1.summary && (
                <InspectSummary
                  summary={inspectDataV1.summary}
                  joins={inspectDataV1.joins}
                  sources={inspectDataV1.sources}
                />
              )}
              {inspectDataV1.joins && inspectDataV1.joins.length > 0 && (
                <InspectJoins
                  joins={inspectDataV1.joins}
                  sources={inspectDataV1.sources ?? undefined}
                />
              )}
              {inspectDataV1.column_comparisons &&
                inspectDataV1.column_comparisons.length > 0 && (
                  <InspectColumnComparisons
                    comparisons={inspectDataV1.column_comparisons}
                    sources={inspectDataV1.sources}
                    target={inspectDataV1.target}
                    visitedFields={inspectDataV1.visited_fields}
                  />
                )}
            </Stack>
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </PageContainer>
  );
};

type AllLensesContentProps = {
  transformId: TransformId;
  discovery: InspectorDiscoveryResponse;
};

const AllLensesContent = ({
  transformId,
  discovery,
}: AllLensesContentProps) => {
  const availableLenses = discovery.available_lenses;

  // Track which lenses are open (all open by default)
  const [openLensIds, setOpenLensIds] = useState<Set<string>>(
    () => new Set(availableLenses.map((l) => l.id)),
  );

  const closedLenses = useMemo(
    () => availableLenses.filter((l) => !openLensIds.has(l.id)),
    [availableLenses, openLensIds],
  );

  const handleCloseLens = (lensId: string) => {
    setOpenLensIds((prev) => {
      const next = new Set(prev);
      next.delete(lensId);
      return next;
    });
  };

  const handleOpenLens = (lensId: string) => {
    setOpenLensIds((prev) => new Set([...prev, lensId]));
  };

  const visibleLenses = availableLenses.filter((l) => openLensIds.has(l.id));

  return (
    <Stack gap="xl">
      {/* Buttons to reopen closed lenses */}
      {closedLenses.length > 0 && (
        <Flex gap="sm" wrap="wrap">
          {closedLenses.map((lens) => (
            <Button
              key={lens.id}
              variant="light"
              size="xs"
              onClick={() => handleOpenLens(lens.id)}
            >
              {t`Show`} {lens.display_name}
            </Button>
          ))}
        </Flex>
      )}

      {visibleLenses.map((lens, index) => (
        <Stack key={lens.id} gap="lg">
          {index > 0 && <Divider />}
          <LensContent
            transformId={transformId}
            lensId={lens.id}
            discovery={discovery}
            onClose={() => handleCloseLens(lens.id)}
          />
        </Stack>
      ))}
    </Stack>
  );
};
