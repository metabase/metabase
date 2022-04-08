import React, { useCallback } from "react";
import { t } from "ttag";
import moment from "moment";

import CheckBox from "metabase/core/components/CheckBox";
import Link from "metabase/core/components/Link";
import DateTime from "metabase/components/DateTime";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import PaginationControls from "metabase/components/PaginationControls";

import PersistedModels from "metabase/entities/persisted-models";
import { capitalize } from "metabase/lib/formatting";
import * as Urls from "metabase/lib/urls";
import { CardApi } from "metabase/services";

import { useListSelect } from "metabase/hooks/use-list-select";
import { usePagination } from "metabase/hooks/use-pagination";

import { ModelCacheRefreshJob } from "./types";
import {
  ErrorBox,
  IconButtonContainer,
  PaginationControlsContainer,
  StyledLink,
} from "./ModelCacheRefreshJobs.styled";

type JobTableItemProps = {
  job: ModelCacheRefreshJob;
  isSelected: boolean;
  handleSelect: () => void;
};

function JobTableItem({ job, isSelected, handleSelect }: JobTableItemProps) {
  const modelUrl = Urls.dataset({ id: job.card_id, name: job.card_name });
  const collectionUrl = Urls.collection({
    id: job.collection_id,
    name: job.collection_name,
  });

  const lastRunAtLabel = capitalize(moment(job.refresh_begin).fromNow());

  const renderStatus = useCallback(() => {
    if (job.state === "persisted") {
      return t`Completed`;
    }
    if (job.state === "error") {
      return (
        <Link to={`/admin/tools/model-caching/${job.id}`}>
          <ErrorBox>{job.error}</ErrorBox>
        </Link>
      );
    }
    return job.state;
  }, [job]);

  const handleRefresh = () => CardApi.refreshModelCache({ id: job.card_id });

  return (
    <tr key={job.id}>
      <th>
        <CheckBox checked={isSelected} onChange={handleSelect} />
      </th>
      <th>
        <span>
          <StyledLink to={modelUrl}>{job.card_name}</StyledLink> {t`in`}{" "}
          <StyledLink to={collectionUrl}>
            {job.collection_name || t`Our analytics`}
          </StyledLink>
        </span>
      </th>
      <th>{renderStatus()}</th>
      <th>
        <Tooltip tooltip={<DateTime value={job.refresh_begin} />}>
          {lastRunAtLabel}
        </Tooltip>
      </th>
      <th>{job.creator.common_name}</th>
      <th>
        <Tooltip tooltip={t`Refresh`}>
          <IconButtonContainer onClick={handleRefresh}>
            <Icon name="refresh" />
          </IconButtonContainer>
        </Tooltip>
      </th>
    </tr>
  );
}

const PAGE_SIZE = 20;

function getJobId(job: ModelCacheRefreshJob) {
  return job.id;
}

type Props = {
  children: JSX.Element;
};

type PersistedModelsListLoaderProps = {
  persistedModels: ModelCacheRefreshJob[];
  metadata: {
    total: number;
    limit: number | null;
    offset: number | null;
  };
};

function ModelCacheRefreshJobs({ children }: Props) {
  const { page, handleNextPage, handlePreviousPage } = usePagination();
  const { selected, toggleItem, toggleAll, getIsSelected } = useListSelect(
    getJobId,
  );

  const query = {
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  };

  return (
    <>
      <PersistedModels.ListLoader query={query} keepListWhileLoading>
        {({ persistedModels, metadata }: PersistedModelsListLoaderProps) => {
          const areAllJobsSelected = selected.length === persistedModels.length;
          const hasPagination = metadata.total > PAGE_SIZE;
          const toggleAllJobs = () => toggleAll(persistedModels);

          return (
            <>
              <table className="ContentTable border-bottom">
                <colgroup>
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "40%" }} />
                  <col />
                  <col />
                  <col style={{ width: "5%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      <CheckBox
                        checked={areAllJobsSelected}
                        onChange={toggleAllJobs}
                      />
                    </th>
                    <th>{t`Model`}</th>
                    <th>{t`Status`}</th>
                    <th>{t`Last run at`}</th>
                    <th>{t`Created by`}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {persistedModels.map(job => (
                    <JobTableItem
                      key={job.id}
                      job={job}
                      isSelected={getIsSelected(job)}
                      handleSelect={() => toggleItem(job)}
                    />
                  ))}
                </tbody>
              </table>
              {hasPagination && (
                <PaginationControlsContainer>
                  <PaginationControls
                    showTotal
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={metadata.total}
                    itemsLength={persistedModels.length}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                  />
                </PaginationControlsContainer>
              )}
            </>
          );
        }}
      </PersistedModels.ListLoader>
      {children}
    </>
  );
}

export default ModelCacheRefreshJobs;
