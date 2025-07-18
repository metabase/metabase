import { createSelector } from '@reduxjs/toolkit';
import type { ReportState } from './reportSlice';

// Base selector to get the report state
const getReportState = (state: { report: ReportState }) => state.report;

// Entity selectors
export const getReportEntities = createSelector(
  [getReportState],
  (reportState) => reportState.entities
);

export const getReportEntityCount = createSelector(
  [getReportEntities],
  (entities) => entities.length
);

// Results selectors
export const getReportResults = createSelector(
  [getReportState],
  (reportState) => reportState.results
);

export const getReportEntityResult = createSelector(
  [getReportResults, (_state: any, entityId: string) => entityId],
  (results, entityId) => results[entityId] || null
);

export const getReportEntityData = createSelector(
  [getReportEntityResult],
  (result) => result?.data || null
);

export const getReportEntityError = createSelector(
  [getReportEntityResult],
  (result) => result?.error || null
);

export const getReportEntityLoading = createSelector(
  [getReportEntityResult],
  (result) => result?.loading || false
);

export const getReportEntityLastRun = createSelector(
  [getReportEntityResult],
  (result) => result?.lastRun || null
);

// Run status selectors
export const getIsReportRunning = createSelector(
  [getReportState],
  (reportState) => reportState.isRunning
);

export const getReportLastRunAt = createSelector(
  [getReportState],
  (reportState) => reportState.lastRunAt
);

export const getReportRunError = createSelector(
  [getReportState],
  (reportState) => reportState.runError
);

// Computed selectors
export const getReportHasResults = createSelector(
  [getReportResults],
  (results) => Object.keys(results).length > 0
);

export const getReportResultsWithStatus = createSelector(
  [getReportEntities, getReportResults],
  (entities, results) => {
    return entities.map(entity => ({
      entity,
      result: results[entity.id] || null,
      hasData: !!(results[entity.id]?.data),
      isLoading: results[entity.id]?.loading || false,
      hasError: !!(results[entity.id]?.error),
    }));
  }
);

export const getReportCanRun = createSelector(
  [getReportEntities, getIsReportRunning],
  (entities, isRunning) => entities.length > 0 && !isRunning
);

export const getReportRunProgress = createSelector(
  [getReportEntities, getReportResults, getIsReportRunning],
  (entities, results, isRunning) => {
    if (!isRunning || entities.length === 0) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const completed = entities.filter(entity => {
      const result = results[entity.id];
      return result && !result.loading;
    }).length;

    return {
      completed,
      total: entities.length,
      percentage: Math.round((completed / entities.length) * 100)
    };
  }
);
