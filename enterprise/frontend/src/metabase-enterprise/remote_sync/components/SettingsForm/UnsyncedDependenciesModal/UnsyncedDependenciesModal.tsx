import { useFormikContext } from "formik";
import { Fragment, type ReactNode } from "react";
import { jt, t } from "ttag";

import { Link } from "metabase/router";
import {
  Anchor,
  Box,
  Button,
  FocusTrap,
  Group,
  Icon,
  Modal,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { RemoteSyncItem } from "metabase-types/api";

import type { SettingsFormValues } from "../../../types";
import { getItemName, getItemUrl, getModelIcon } from "../../../utils";

import S from "./UnsyncedDependenciesModal.module.css";
import {
  type DependencyGroup,
  type DependencyGroupCollection,
  getDependencyGroups,
  sortItems,
} from "./utils";

type UnsyncedDependenciesModalProps = {
  dependencies: RemoteSyncItem[];
  onClose: () => void;
};

export function UnsyncedDependenciesModal({
  dependencies,
  onClose,
}: UnsyncedDependenciesModalProps) {
  const { submitForm, isSubmitting } = useFormikContext<SettingsFormValues>();

  return (
    <Modal
      opened
      title={t`Synced content uses unsynced content`}
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <Stack gap="lg">
        <Text>{t`Sync the collections this content is in, or remove the references to it.`}</Text>
        {getDependencyGroups(dependencies).map((group) => (
          <DependencyGroupItem key={group.key} group={group} />
        ))}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose}>{t`Back`}</Button>
          <Button
            variant="filled"
            loading={isSubmitting}
            onClick={submitForm}
          >{t`Save changes`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type DependencyGroupItemProps = {
  group: DependencyGroup;
};

function DependencyGroupItem({ group }: DependencyGroupItemProps) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw="bold">
          {group.collection ? (
            <EntityLink
              name={group.collection.name}
              url={Urls.modelToUrl({
                id: group.collection.id,
                model: "collection",
                name: group.collection.name,
              })}
            />
          ) : (
            t`Not in a collection`
          )}
        </Text>
        {group.collection ? (
          <CollectionSyncSwitch collection={group.collection} />
        ) : null}
      </Group>
      {group.dependencies.map((dependency) => (
        <Stack
          key={`${dependency.model}-${dependency.id}`}
          gap={0}
          align="flex-start"
        >
          <EntityLink
            name={getItemName(dependency)}
            url={getItemUrl(dependency)}
          >
            <Group gap="sm" wrap="nowrap">
              <Icon name={getModelIcon(dependency.model)} aria-hidden />
              <Box>{getItemName(dependency)}</Box>
            </Group>
          </EntityLink>
          <Text c="text-secondary" fz="sm">
            {jt`Used by ${sortItems(dependency.used_by ?? []).map(
              (item, index) => (
                <Fragment key={`${item.model}-${item.id}`}>
                  {index > 0 && ", "}
                  <EntityLink name={getItemName(item)} url={getItemUrl(item)} />
                </Fragment>
              ),
            )}`}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

type EntityLinkProps = {
  name: string;
  url: string | null;
  children?: ReactNode;
};

function EntityLink({ name, url, children = name }: EntityLinkProps) {
  return url != null ? (
    <Anchor
      component={Link}
      to={url}
      target="_blank"
      className={S.link}
      fz="inherit"
      fw="inherit"
    >
      {children}
    </Anchor>
  ) : (
    children
  );
}

type CollectionSyncSwitchProps = {
  collection: DependencyGroupCollection;
};

function CollectionSyncSwitch({ collection }: CollectionSyncSwitchProps) {
  const { values, setFieldValue } = useFormikContext<SettingsFormValues>();
  if (!(collection.id in values.collections)) {
    return <Text c="text-secondary">{t`Can't be synced`}</Text>;
  }

  const isSynced = values.collections[collection.id] ?? false;

  const handleChange = (checked: boolean) =>
    setFieldValue("collections", {
      ...values.collections,
      [collection.id]: checked,
    });

  return (
    <Switch
      label={t`Sync`}
      aria-label={t`Sync ${collection.name}`}
      checked={isSynced}
      onChange={(event) => handleChange(event.currentTarget.checked)}
    />
  );
}
