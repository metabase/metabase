import type { Location } from "history";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { replace } from "react-router-redux";
import { t } from "ttag";

import { searchApi } from "metabase/api";
import { TAG_TYPE_MAPPING, listTag } from "metabase/api/tags";
import { getIcon } from "metabase/browse/models/utils";
import { EllipsifiedCollectionPath } from "metabase/common/components/EllipsifiedPath/EllipsifiedCollectionPath";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
import { useDispatch, useSelector } from "metabase/lib/redux/hooks";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { getQuestion } from "metabase/query_builder/selectors";
import {
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  Loader,
  NavLink,
  Text,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { RecentCollectionItem } from "metabase-types/api";

import { BenchLayout } from "../BenchLayout";
import { BenchPaneHeader } from "../BenchPaneHeader";
import { ItemsListSection } from "../ItemsListSection/ItemsListSection";

import { CreateModelMenu } from "./CreateModelMenu";

function ModelsList({ activeId }: { activeId: number }) {
  const { isLoading, data } = useFetchModels();
  const models = data?.data;

  return (
    <ItemsListSection
      sectionTitle="Models"
      AddButton={CreateModelMenu}
      onAddNewItem={() => {}}
      listItems={
        !models || isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : (
          models.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              active={model.id === activeId}
            />
          ))
        )
      }
    />
  );
}

function ModelListItem({
  model,
  active,
}: {
  model: RecentCollectionItem;
  active?: boolean;
}) {
  const icon = getIcon({ type: "dataset", ...model });
  return (
    <Box mb="sm">
      <NavLink
        component={Link}
        to={`/bench/model/${model.id}`}
        active={active}
        label={
          <>
            <Flex gap="sm" align="center">
              <FixedSizeIcon {...icon} size={16} c="brand" />
              <Text fw="bold" c={active ? "brand" : undefined}>
                {model.name}
              </Text>
            </Flex>
            <Flex gap="sm" c="text-light" ml="lg">
              <FixedSizeIcon name="folder" />
              <EllipsifiedCollectionPath collection={model.collection} />
            </Flex>
          </>
        }
      />
    </Box>
  );
}

export const ModelsLayout = ({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) => {
  return (
    <BenchLayout nav={<ModelsList activeId={+params.slug} />} name="model">
      {children}
    </BenchLayout>
  );
};

const ModelEditorHeader = ({ buttons }: { buttons?: ReactNode }) => {
  const question = useSelector(getQuestion);
  if (!question) {
    return null;
  }
  return (
    <BenchPaneHeader
      title={question.displayName() ?? t`New model`}
      actions={buttons}
    />
  );
};

export const ModelEditor = (props: {
  location: Location;
  params: { slug: string };
}) => {
  const dispatch = useDispatch();

  return (
    <QueryBuilder
      {...props}
      Header={ModelEditorHeader}
      preventCancel
      onCreateSuccess={(q: Question) => {
        dispatch(replace(`/bench/model/${q.id()}`));
        dispatch(
          searchApi.util.invalidateTags([listTag(TAG_TYPE_MAPPING["dataset"])]),
        );
      }}
    />
  );
};
