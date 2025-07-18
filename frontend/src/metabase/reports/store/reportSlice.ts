import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface ReportEntity {
  id: string;
  name: string;
  type: string;
  model: 'card' | 'table' | 'dashboard';
}

export interface ReportEntityResult {
  entityId: string;
  data: any;
  error: string | null;
  loading: boolean;
  lastRun: string | null;
}

export interface ReportState {
  entities: ReportEntity[];
  results: Record<string, ReportEntityResult>;
  isRunning: boolean;
  lastRunAt: string | null;
  runError: string | null;
}

const initialState: ReportState = {
  entities: [],
  results: {},
  isRunning: false,
  lastRunAt: null,
  runError: null,
};

// Async thunk for running a single entity
export const runReportEntity = createAsyncThunk(
  'report/runEntity',
  async (entity: ReportEntity, { rejectWithValue }) => {
    try {
      let card;
      let queryResult;

      if (entity.model === 'table') {
        // For tables, fetch table metadata and create a card-like object
        const tableResponse = await fetch(`/api/table/${entity.id}`);
        if (!tableResponse.ok) {
          throw new Error(`Failed to fetch table: ${tableResponse.statusText}`);
        }

        const table = await tableResponse.json();
        card = {
          id: table.id,
          name: table.display_name || table.name,
          display: 'table',
          database_id: table.db_id,
          dataset_query: {
            database: table.db_id,
            type: 'query',
            query: {
              'source-table': table.id
            }
          },
          visualization_settings: {
            'table.pivot': false,
            'table.column_formatting': []
          }
        };

        // Query the table data
        const tableQueryResponse = await fetch(`/api/dataset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            database: card.database_id,
            type: 'query',
            query: {
              'source-table': entity.id,
              limit: 100
            }
          })
        });

        if (!tableQueryResponse.ok) {
          throw new Error(`Failed to fetch table data: ${tableQueryResponse.statusText}`);
        }

        queryResult = await tableQueryResponse.json();

      } else if (entity.model === 'card') {
        // For cards, fetch card data
        const cardResponse = await fetch(`/api/card/${entity.id}`);
        if (!cardResponse.ok) {
          throw new Error(`Failed to fetch card: ${cardResponse.statusText}`);
        }

        card = await cardResponse.json();

        // Fetch query results
        const queryResponse = await fetch(`/api/card/${entity.id}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ignore_cache: false,
            parameters: []
          })
        });

        if (!queryResponse.ok) {
          throw new Error(`Failed to fetch query results: ${queryResponse.statusText}`);
        }

        queryResult = await queryResponse.json();

      } else {
        throw new Error(`Unsupported entity model: ${entity.model}`);
      }

      const displayType = entity.model === 'table' ? 'table' : card.display;
      const dataToSpread = queryResult.data || queryResult;

      const rawSeries = [{
        card: {
          ...card,
          display: displayType,
          visualization_settings: {
            ...card.visualization_settings,
            ...(entity.model === 'table' && {
              'table.pivot': false,
              'table.column_formatting': []
            })
          }
        },
        data: dataToSpread,
        started_at: new Date().toISOString()
      }];

      console.log('Created rawSeries in Redux:', rawSeries);
      console.log('dataToSpread structure:', dataToSpread);
      console.log('First series object keys:', Object.keys(rawSeries[0]));

      return {
        entityId: entity.id,
        data: rawSeries,
        lastRun: new Date().toISOString()
      };

    } catch (error) {
      return rejectWithValue({
        entityId: entity.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Async thunk for running all entities in the report
export const runReport = createAsyncThunk(
  'report/runAll',
  async (_, { getState, dispatch }) => {
    const state = getState() as { report: ReportState };
    const entities = state.report.entities;

    const results = await Promise.allSettled(
      entities.map(entity => dispatch(runReportEntity(entity)))
    );

    return {
      timestamp: new Date().toISOString(),
      results: results.map((result, index) => ({
        entityId: entities[index].id,
        success: result.status === 'fulfilled',
        error: result.status === 'rejected' ? result.reason : null
      }))
    };
  }
);

const reportSlice = createSlice({
  name: 'report',
  initialState,
  reducers: {
    updateEntities: (state, action: PayloadAction<ReportEntity[]>) => {
      state.entities = action.payload;

      // Remove results for entities that are no longer in the document
      const entityIds = new Set(action.payload.map(e => e.id));
      Object.keys(state.results).forEach(id => {
        if (!entityIds.has(id)) {
          delete state.results[id];
        }
      });
    },

    clearResults: (state) => {
      state.results = {};
      state.lastRunAt = null;
      state.runError = null;
    },

    clearRunError: (state) => {
      state.runError = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Run single entity
      .addCase(runReportEntity.pending, (state, action) => {
        const entityId = action.meta.arg.id;
        state.results[entityId] = {
          entityId,
          data: null,
          error: null,
          loading: true,
          lastRun: null
        };
      })
      .addCase(runReportEntity.fulfilled, (state, action) => {
        const { entityId, data, lastRun } = action.payload;
        state.results[entityId] = {
          entityId,
          data,
          error: null,
          loading: false,
          lastRun
        };
      })
      .addCase(runReportEntity.rejected, (state, action) => {
        const { entityId, error } = action.payload as any;
        state.results[entityId] = {
          entityId,
          data: null,
          error,
          loading: false,
          lastRun: null
        };
      })

      // Run all entities
      .addCase(runReport.pending, (state) => {
        state.isRunning = true;
        state.runError = null;

        // Mark all entities as loading
        state.entities.forEach(entity => {
          state.results[entity.id] = {
            entityId: entity.id,
            data: state.results[entity.id]?.data || null,
            error: null,
            loading: true,
            lastRun: state.results[entity.id]?.lastRun || null
          };
        });
      })
      .addCase(runReport.fulfilled, (state, action) => {
        state.isRunning = false;
        state.lastRunAt = action.payload.timestamp;

        // Check if there were any errors
        const hasErrors = action.payload.results.some(r => !r.success);
        if (hasErrors) {
          state.runError = 'Some entities failed to run. Check individual results for details.';
        }
      })
      .addCase(runReport.rejected, (state, action) => {
        state.isRunning = false;
        state.runError = action.error.message || 'Failed to run report';
      });
  },
});

export const { updateEntities, clearResults, clearRunError } = reportSlice.actions;
export default reportSlice.reducer;
