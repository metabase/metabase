# Metabase workbench


If the main part of Metabase is about playing with data, the workbench is where the toys get made. This is lean forward style work, and so it's ok to have more detail and complexity. It serves as an overflow.

If data needs assembled from different databases or sources, relabled, organized, contextualized, and calculations made, that primarily happens in this section of the app.


## Accessing the separate mode
For right now, we access the workbench mode via the ProfileLink component and a link to /bench. This is a set of sub routes

Sub routes without the rest of the app layout are achieved this way. All routes should be added to /bench/routes.tsx 

## Route Structure and Nested Composition

### Basic Route Setup
Routes should use React Router's nested composition pattern. The main routes file should be structured like:

```tsx
// frontend/src/metabase/bench/routes.tsx
import { Route } from "metabase/hoc/Title";
import { BenchLayout } from "./BenchLayout";
import { MetricsApp } from "./MetricsApp";
import { MetricsDetails } from "./components/MetricsDetails/MetricsDetails";
import { NewMetricPage } from "./components/NewMetricPage/NewMetricPage";

export function getBenchRoutes() {
  return (
    <Route path="/bench" component={BenchLayout}>
      <IndexRoute component={BenchApp} />
      
      {/* METRICS - Tool layout with nested routes */}
      <Route path="metrics" component={MetricsApp}>
        <Route path="new" component={NewMetricPage} />
        <Route path=":metricId" component={MetricsDetails} />
      </Route>

      {/* Other tool layouts follow same pattern */}
    </Route>
  );
}
```

### Tool Layout Pattern for Individual Items

When creating tool layouts that show both a list and individual item details:

1. **Parent Component (e.g., MetricsApp)**: 
   - Renders the tool layout with left panel (entities list) and main panel
   - Accepts `children` prop and renders it in the main panel
   - Does NOT handle URL params directly - lets React Router handle composition

2. **Detail Component (e.g., MetricsDetails)**:
   - Receives route `params` with the item ID
   - Loads item data using appropriate hooks based on the ID from params
   - Never receives data as props - always fetches from API

**Example Parent Component:**
```tsx
interface MetricsAppProps {
  children?: React.ReactNode;
}

export function MetricsApp({ children }: MetricsAppProps) {
  return (
    <PanelGroup direction="horizontal">
      {/* Left Panel - Entity List */}
      <Panel>
        <MetricsEntitiesList />
      </Panel>
      
      {/* Main Panel - Shows child route content */}
      <Panel>
        {children}
      </Panel>
    </PanelGroup>
  );
}
```

**Example Detail Component:**
```tsx
interface MetricsDetailsProps {
  params: {
    metricId: string;
  };
}

export function MetricsDetails({ params }: MetricsDetailsProps) {
  const metricId = parseInt(params.metricId, 10);
  
  // Always load from API using route params
  const { data: metricData, isLoading } = useGetCardQuery({ id: metricId });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return (
    <div>
      <h1>{metricData?.name}</h1>
      {/* ... metric details */}
    </div>
  );
}
```

### Key Principles

1. **Never use `children ||` fallback patterns** - let React Router handle composition
2. **Individual items are ALWAYS loaded from route params** - never passed as props
3. **Parent components render `{children}` directly** - no conditional logic
4. **Detail components receive and parse `params.itemId`** - use appropriate data loading hooks

This pattern ensures that:
- URLs work correctly for direct navigation
- The entity list remains visible when viewing individual items
- Routes compose properly using React Router's built-in mechanisms
- No manual route parameter handling is needed in parent components

## Structure
From left to right, taking up the full height of the view are panels.

- Major modes (standard navbar width, resizable and collapsible)
- Layout for mode type
 - Tool layouts
    - Left panel
    - Main view
        - Authoring tool
         - Notebook mode
         - SQL editor (code mirror)
        - Most authoring tools output a table and this is shown below the tool in a card with a border.
         - This component should accept the result of a
 - We may have an unknown amount of other types of layouts, for example runs or job listings

- Metabot is on the far right independent of other UI state.

Metabot can always be opened or closed, alongside other.

### Major modes
Listed as major mode name, and layout type.
 - Overview (overview)
 - Metadata (tool)
 - Transforms (tool)
 - Segments (tool)
 - Models (tool)
 - Metrics (tool)
 - Glossary (unsure)


### Tool views
Tools (as listed above) should have the same basic layout that's comprised of a series of panels that are resizable via "react-resizeable"


# Left panel
 This is where left panel tools (mostly lists) will go.

# Main view
For most modes this will be either a notebook instance or a


### Gathering data
All functions needed to list metrics or load a metric are here. Use simple react state in the parent components instead of complicated redux where possible. For a given major mode, always create a new listing component that can live inside the lefthand panel.

For loading individual items by ID:

- useGetCardQuery({ id }) from metabase/api - loads any card (question, model, or metric) by ID
- useLazyGetCardQuery from metabase/api - lazy version that doesn't auto-execute
- useGetCardQueryMetadataQuery(cardId) from metabase/api - loads query metadata for a card

For loading collections/lists:

- useFetchMetrics(params) from metabase/common/hooks/use-fetch-metrics - uses search API with models: ["metric"]
- useFetchModels(params) from metabase/common/hooks/use-fetch-models - uses search API with models: ["dataset"]
- useSearchQuery(params) from metabase/api/search - generic search across all content types

**Important**: These hooks return a SearchResponse object with a `data` property containing the array of results. Access the data like this:
```typescript
const { data: searchResponse, isLoading, error } = useFetchMetrics();
const metrics = searchResponse?.data || [];
```

Key functions:
- frontend/src/metabase/api/card.ts:71 - getCard endpoint
- frontend/src/metabase/common/hooks/use-fetch-metrics.tsx:4 - useFetchMetrics hook
- frontend/src/metabase/common/hooks/use-fetch-models.tsx:4 - useFetchModels hook
- frontend/src/metabase/api/search.ts:10 - search endpoint


Loading Individual Transforms (Enterprise Only)

For loading individual transforms by ID:

- useGetTransformQuery(id) from metabase-enterprise/api - loads a single transform by ID
- useLazyGetTransformQuery from metabase-enterprise/api - lazy version

For loading collections/lists:

- useListTransformsQuery() from metabase-enterprise/api - loads all transforms
- useListTransformRunsQuery(params) from metabase-enterprise/api - loads transform execution runs
- useListTransformDependenciesQuery(id) from metabase-enterprise/api - loads dependencies for a transform

Key functions:
- enterprise/frontend/src/metabase-enterprise/api/transform.ts:45 - getTransform endpoint
- enterprise/frontend/src/metabase-enterprise/api/transform.ts:25 - listTransforms endpoint
- enterprise/frontend/src/metabase-enterprise/api/transform.ts:33 - listTransformRuns endpoint

```
Usage examples:
// Load individual transform by ID (Enterprise)
const { data: transform } = useGetTransformQuery(transformId);
```

```
// Load all transforms (Enterprise)
const { data: transforms } = useListTransformsQuery();
```

```
// Load transform runs with filters (Enterprise)
const { data: runs } = useListTransformRunsQuery({
transform_ids: [transformId],
statuses: ['succeeded', 'failed']
});
```

Summary of all loading functions:

| Type       | Individual Load          | List Load                | Location   |
|------------|--------------------------|--------------------------|------------|
| Metrics    | useGetCardQuery({ id })  | useFetchMetrics()        | OSS        |
| Models     | useGetCardQuery({ id })  | useFetchModels()         | OSS        |
| Transforms | useGetTransformQuery(id) | useListTransformsQuery() | Enterprise |

Usage examples:
// Load individual metric/model by ID
const { data: card } = useGetCardQuery({ id: metricId });

// Load all metrics
const { data: metrics } = useFetchMetrics();

// Load all models
const { data: models } = useFetchModels();


#### Segments
Loading Individual Segments

For loading individual segments by ID:

- useGetSegmentQuery(id) from metabase/api/segment - loads a single segment by ID
- Also available through legacy entity system but it's deprecated

For loading collections/lists:

- useListSegmentsQuery() from metabase/api/segment - loads all segments
- useSearchQuery({ models: ["segment"] }) from metabase/api/search - search for segments (limited support as segments are not in ENABLED_SEARCH_MODELS)

Key functions:
- frontend/src/metabase/api/segment.ts:35 - getSegment endpoint
- frontend/src/metabase/api/segment.ts:24 - listSegments endpoint
- frontend/src/metabase/entities/segments.js:86 - legacy useGetQuery wrapper (deprecated)

Usage examples:
// Load individual segment by ID
const { data: segment } = useGetSegmentQuery(segmentId);

// Load all segments
const { data: segments } = useListSegmentsQuery();

// Search segments (limited support)
const { data: results } = useSearchQuery({ models: ["segment"] });


#### Running queries
To run queries, use this

useGetCardQueryQuery from metabase/api/card

This hook corresponds to the getCardQuery endpoint on line 96-104, which makes a POST request to /api/card/${cardId}/query.

Usage:
```
import { useGetCardQueryQuery } from "metabase/api/card";

// Run a query for a metric or model
const { data, isLoading, error } = useGetCardQueryQuery({
cardId: 123,
parameters: [], // optional parameters
ignore_cache: false, // optional
dashboard_id: null, // optional
collection_preview: false, // optional
});
```

Key details:
- Located at frontend/src/metabase/api/card.ts:331
- Returns a Dataset with the query results
- Automatically handles caching and provides loading states
- Can accept parameters for parameterized queries
- Works for any card type (question, metric, or model)

### Loading cards into the notebook editor
For models and metrics, we'll want to use a pattern similar to this to load up their queries in the notebook editor.

For models only, if based on SQL, we'll use our code mirror component.

```
import { useDispatch } from "metabase/lib/redux";
  import { loadMetadataForCard } from "metabase/questions/actions";
  import { Notebook } from "metabase/querying/notebook/components/Notebook";
  import Question from "metabase-lib/v1/Question";
  import type { Card } from "metabase-types/api";

  // In your workbench component
  export const WorkbenchNotebook = ({ card }: { card: Card }) => {
    const dispatch = useDispatch();
    const metadata = useSelector(getMetadata);
    const [question, setQuestion] = useState<Question | null>(null);

    useEffect(() => {
      const loadData = async () => {
        // Use the generic metadata loader
        await dispatch(loadMetadataForCard(card));

        // Create question after metadata is loaded
        const freshMetadata = getMetadata(store.getState());
        const questionInstance = new Question(card, freshMetadata);
        setQuestion(questionInstance);
      };

      if (card) {
        loadData();
      }
    }, [card, dispatch]);

    if (!question) {
      return <div>Loading...</div>;
    }

    return (
      <Notebook
        question={question}
        updateQuestion={setQuestion}
        isResultDirty={false}
        reportTimezone="UTC"
      />
    );
  };
```

### Other
- Only use ui components from "metabase/ui"
- Do not use "dimmed" with text color.
- We are on a legacy version of react-router (v3)
- Prefer simple links to routes vs using functions for navigation for user interaction (functions are ok if they happen post interaction)

### State of prototype and major remaining todos.
- Transforms is basically working as expected.
- We have an example of how to do a tool layout in the transforms work, but its not necessarily fully set up to be reused.
- **Metrics**: ✅ COMPLETED - Tool layout implemented with MetricsApp, MetricsEntitiesList, and MetricsDetails components. Uses proper data access pattern for SearchResponse.data.
- **Models**: ✅ COMPLETED - Tool layout implemented with ModelsApp, ModelsEntitiesList, and ModelsDetails components. Uses proper data access pattern for SearchResponse.data. Route added at `/bench/models`.
- Models and metrics need to load their queries in the notebook editor component. See above section on pattern.
- Segments needs updated to use the new tool layout and detail views.
- Metadata is working and does not need modified at this time.
- We need to move Metabot to its own panel.
- Create a small toolbar at the very bottom of the overall layout that makes it possible to independently collapse the main nav, the left hand panel, or the right hand panel, and metabot.

### Sidebar Navigation Management
When adding new routes to the bench application, remember to update the sidebar navigation in `frontend/src/metabase/bench/components/BenchSidebar/BenchSidebar.tsx`:

1. **Add new nav items** to the `navItems` array with:
   - `label`: Display name for the navigation item
   - `icon`: Icon component (use appropriate Metabase icons)
   - `path`: Route path that matches the route definition
   - `description`: Tooltip description for the navigation item

2. **Update existing items** when routes change:
   - Ensure the `path` matches the actual route definition
   - Update `description` if functionality changes
   - Change `icon` if a different icon is more appropriate

3. **Route consistency**: Always ensure that the sidebar paths match the route definitions in `/bench/routes.tsx`

Example of adding a new navigation item:
```typescript
{
  label: t`New Feature`,
  icon: <Icon name="feature-icon" size={16} />,
  path: "/bench/new-feature",
  description: t`Description of the new feature`,
}
```
