# Metabase workbench


If the main part of Metabase is about playing with data, the workbench is where the toys get made. This is lean forward style work, and so it's ok to have more detail and complexity. It serves as an overflow.

If data needs assembled from different databases or sources, relabled, organized, contextualized, and calculations made, that primarily happens in this section of the app.


## Accessing the separate mode
For right now, we access the workbench mode via the ProfileLink component and a link to /bench. This is a set of sub routes

Sub routes without the rest of the app layout are achieved this way. All routes should be added to /bench/routes.tsx In general routes
should follow the pattern of.

```
+++ b/frontend/src/metabase/bench/BenchLayout.tsx
@@ -0,0 +1,26 @@
+import { MantineProvider, AppShell, Box } from "@mantine/core";
+import type { ReactNode } from "react";
+
+interface BenchLayoutProps {
+  children: ReactNode;
+}
+
+const benchTheme = {
+  primaryColor: "blue",
+  defaultRadius: "md",
+  fontFamily: "system-ui, sans-serif",
+};
+
+export function BenchLayout({ children }: BenchLayoutProps) {
+  return (
+    <MantineProvider theme={benchTheme}>
+      <AppShell padding="md">
+        <AppShell.Main>
+          <Box p="xl">
+            {children}
+          </Box>
+        </AppShell.Main>
+      </AppShell>
+    </MantineProvider>
+  );
+}

```
diff --git a/frontend/src/metabase/bench/routes.tsx b/frontend/src/metabase/bench/routes.tsx
new file mode 100644
index 00000000000..2bfb1e05a62
--- /dev/null
+++ b/frontend/src/metabase/bench/routes.tsx
@@ -0,0 +1,14 @@
+import { IndexRedirect } from "react-router";
+import { Route } from "metabase/hoc/Title";
+import { BenchLayout } from "./BenchLayout";
+import { ExamplePage1, ExamplePage2 } from "./pages";
+
+export function getBenchRoutes() {
+  return (
+    <Route path="/bench" component={BenchLayout}>
+      <IndexRedirect to="/bench/page1" />
+      <Route path="page1" title="Bench - Example Page 1" component={ExamplePage1} />
+      <Route path="page2" title="Bench - Example Page 2" component={ExamplePage2} />
+    </Route>
+  );
+}

```
diff --git a/frontend/src/metabase/routes.jsx b/frontend/src/metabase/routes.jsx
index 06dd9ae9131..2079b3a35e0 100644
--- a/frontend/src/metabase/routes.jsx
+++ b/frontend/src/metabase/routes.jsx
@@ -30,6 +30,7 @@ import { DashboardMoveModalConnected } from "metabase/dashboard/components/Dashb
 import { ArchiveDashboardModalConnected } from "metabase/dashboard/containers/ArchiveDashboardModal";
 import { AutomaticDashboardApp } from "metabase/dashboard/containers/AutomaticDashboardApp";
 import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
+import { getBenchRoutes } from "metabase/bench/routes";
 import { TableDetailPage } from "metabase/detail-view/pages/TableDetailPage";
 import { ModalRoute } from "metabase/hoc/ModalRoute";
 import { Route } from "metabase/hoc/Title";
@@ -395,6 +396,9 @@ export const getRoutes = (store) => {
         to="/admin/permissions/collections"
       />

+      {/* BENCH */}
+      {getBenchRoutes()}
+
       {/* MISC */}
```

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
