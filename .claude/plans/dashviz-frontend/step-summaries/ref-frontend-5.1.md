# Phase 5.1: Visualization Export and Sharing

This document analyzes the visualization export and sharing functionality in Metabase, focusing on PDF/image export mechanisms, email/Slack subscriptions, and public/embedded visualization patterns.

## 1. Overview

Metabase provides several ways to export and share visualizations and dashboards:

1. **Direct exports**: PDF, PNG, and data formats (CSV, XLSX, JSON)
2. **Scheduled deliveries**: Email and Slack subscriptions
3. **External access**: Public links and embedding options

These features allow users to:
- Save visualizations as static files
- Schedule regular delivery of reports
- Share content with external users
- Embed visualizations in other applications

The system is built with flexibility to support various contexts, including regular Metabase usage, public sharing, and embedded analytics.

## 2. PDF and Image Export

### 2.1 PDF Export Architecture

Metabase's PDF export functionality is primarily handled by `save-dashboard-pdf.ts`, which orchestrates the process of converting a dashboard to a PDF document:

```typescript
export const saveDashboardPdf = async (
  selector: string,
  dashboardName: string,
) => {
  const fileName = `${dashboardName}.pdf`;
  const dashboardRoot = document.querySelector(selector);
  const gridNode = dashboardRoot?.querySelector(".react-grid-layout");
  
  // Implementation includes:
  // 1. Extract dashboard content
  // 2. Create header elements
  // 3. Determine page breaks
  // 4. Render to canvas
  // 5. Create PDF pages
  // 6. Save as file
};
```

Key components of the PDF export process:

1. **DOM Extraction**: Captures the rendered dashboard DOM
2. **Page Break Logic**: Intelligently determines where to break pages
   ```typescript
   export const getPageBreaks = (
     sortedCards: DashCardBounds[],
     optimalPageHeight: number,
     totalHeight: number,
     minPageHeight: number,
     offset = 0,
   ): number[] => {
     // Implementation for determining optimal page breaks
   };
   ```

3. **Canvas Rendering**: Uses html2canvas to convert DOM to images
4. **PDF Generation**: Uses jspdf to create the final PDF

### 2.2 Image Export

Image export is handled by `save-chart-image.ts`, which provides functionality to save individual visualizations as PNG files:

```typescript
export const saveChartImage = async (selector: string, fileName: string) => {
  const node = document.querySelector(selector);

  if (!node || !(node instanceof HTMLElement)) {
    console.warn("No node found for selector", selector);
    return;
  }

  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    onclone: (doc: Document, node: HTMLElement) => {
      // Setup styling for export
    },
  });

  canvas.toBlob((blob) => {
    // Save blob as file
  });
};
```

This function handles:
1. Selecting the DOM element containing the visualization
2. Rendering it to a canvas at 2x scale for good quality
3. Creating a downloadable blob
4. Triggering the browser's save dialog

### 2.3 CSS Styles for Export

To ensure visualizations render correctly in exports, Metabase uses specialized CSS classes:

```typescript
export const saveDomImageStyles = css`
  .${SAVING_DOM_IMAGE_CLASS} {
    .${SAVING_DOM_IMAGE_HIDDEN_CLASS} {
      visibility: hidden;
    }
    .${SAVING_DOM_IMAGE_DISPLAY_NONE_CLASS} {
      display: none;
    }

    // Additional styling specific to exports
    // Including box-shadow replacements
    // And visibility adjustments
  }
`;
```

These styles ensure that exported visualizations:
- Have consistent styling
- Properly handle elements that don't render well in canvas/PDF
- Maintain proper layout and sizing

## 3. Data Export Formats

### 3.1 Data Export Architecture

Metabase's data export system is built around the `downloadQueryResults` function in `downloads.ts`:

```typescript
export const downloadQueryResults = createAsyncThunk(
  "metabase/downloads/downloadQueryResults",
  async (opts: DownloadQueryResultsOpts, { dispatch }) => {
    const { resourceType, accessedVia } = getDownloadedResourceType(opts);
    trackDownloadResults({
      resourceType,
      accessedVia,
      exportType: opts.type,
    });

    if (opts.type === Urls.exportFormatPng) {
      downloadChart(opts);
    } else {
      dispatch(downloadDataset({ opts, id: Date.now() }));
    }
  },
);
```

This function handles different export formats including:
- CSV
- XLSX
- JSON
- PNG (which is handled separately)

### 3.2 Resource Detection and Access Paths

The system detects the resource type and access method to determine the appropriate API endpoint:

```typescript
const getDownloadedResourceType = ({
  dashboardId,
  dashcardId,
  uuid,
  token,
  question,
}: Partial<DownloadQueryResultsOpts>): DownloadedResourceInfo => {
  // Logic to determine resource type and access method
};
```

Resource types include:
- Questions (saved queries)
- Dashboard cards
- Ad-hoc questions

Access methods include:
- Internal (regular Metabase interface)
- Public link
- Static embed
- Interactive iframe embed
- SDK embed

### 3.3 API Endpoint Selection

Based on the resource type and access method, the system selects the appropriate API endpoint:

```typescript
const getDatasetParams = ({
  type,
  question,
  dashboardId,
  dashcardId,
  // Other parameters...
}: DownloadQueryResultsOpts): DownloadQueryResultsParams => {
  // Determine endpoint based on resource type and access method
};
```

Different endpoint patterns are used for:
- Public links: `/api/public/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/${type}`
- Embedded content: `/api/embed/dashboard/${token}/dashcard/${dashcardId}/card/${cardId}/${type}`
- Internal access: `/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${cardId}/query/${type}`

### 3.4 Download State Management

The system uses Redux to manage download states:

```typescript
const downloads = createSlice({
  name: "metabase/downloads",
  initialState,
  reducers: {
    clearAll: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(downloadDataset.pending, (state, action) => {
        // Track in-progress downloads
      })
      .addCase(downloadDataset.fulfilled, (state, action) => {
        // Mark downloads as complete
      })
      .addCase(downloadDataset.rejected, (state, action) => {
        // Handle errors
      });
  },
});
```

This provides:
- Progress tracking for long downloads
- Error handling
- Success notifications

## 4. Dashboard Subscriptions

### 4.1 Subscription Architecture

Dashboard subscriptions (also called "Pulses") are managed through the `DashboardSubscriptionsSidebar` component:

```jsx
class DashboardSubscriptionsSidebarInner extends Component {
  state = {
    editingMode: EDITING_MODES.LIST_PULSES,
    returnMode: [],
    isSaving: false,
    users: undefined,
  };
  
  // Implementation for managing subscriptions
}
```

This component handles:
- Creating new subscriptions
- Editing existing subscriptions
- Managing delivery channels (email, Slack)
- Setting schedule parameters

### 4.2 Pulse Model

Subscriptions are built on the "Pulse" model:

```typescript
export const NEW_PULSE_TEMPLATE = {
  name: null,
  cards: [],
  channels: [],
  skip_if_empty: false,
  collection_id: null,
  parameters: [],
};
```

Each subscription includes:
- Dashboard cards to include
- Delivery channels
- Schedule parameters
- Filters for empty results

### 4.3 Channel Management

Metabase supports different delivery channels, each with their own validation rules:

```typescript
export function channelIsValid(channel: Channel, channelSpec: ChannelSpec) {
  switch (channel.channel_type) {
    case "email":
      return (
        channel.recipients &&
        channel.recipients.length > 0 &&
        channel.recipients.every(recipientIsValid) &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    case "slack":
      return (
        channel.details?.channel &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    case "http":
      return channel.channel_id && scheduleIsValid(channel);
    default:
      return false;
  }
}
```

These channels are displayed in the UI via the appropriate components:
- Email subscriptions: `AddEditEmailSidebar`
- Slack subscriptions: `AddEditSlackSidebar`

### 4.4 Schedule Configuration

Subscriptions can be scheduled at different intervals:

```typescript
export function scheduleIsValid(channel: Channel) {
  switch (channel.schedule_type) {
    case "monthly":
      // Monthly schedule validation
    case "weekly":
      // Weekly schedule validation
    case "daily":
      // Daily schedule validation
    case "hourly":
      // Hourly schedule validation
    default:
      return false;
  }
}
```

The UI presents appropriate options for each schedule type, including:
- Day selection for weekly schedules
- Time selection for daily schedules
- Week of month for monthly schedules

## 5. Public and Embedded Sharing

### 5.1 Embedding Framework

The embedding framework is built around the `embed.ts` library, which handles token generation and URL construction:

```typescript
function getSignedToken(
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParametersValues = {},
  secretKey: string,
  previewEmbeddingParams: EmbeddingParametersValues,
) {
  // Generate signed token for secure embedding
}

export function getSignedPreviewUrlWithoutHash(
  siteUrl: string,
  resourceType: EmbedResourceType,
  resourceId: EmbedResource["id"],
  params: EmbeddingParametersValues = {},
  secretKey: string,
  previewEmbeddingParams: EmbeddingParametersValues,
) {
  // Generate preview URL with token
}
```

This system provides:
- Secure token-based authentication
- Parameter passing to embedded content
- URL generation for previews and actual embedding

### 5.2 Embed Modal Interface

The embedding UI is handled by the `EmbedModal` component:

```typescript
export const EmbedModal = ({ children, isOpen, onClose }: EmbedModalProps) => {
  const shouldShowEmbedTerms = useSelector((state) =>
    getSetting(state, "show-static-embed-terms"),
  );
  const [embedType, setEmbedType] = useState<EmbedModalStep>(null);
  const applicationName = useSelector(getApplicationName);

  // Implementation for modal stages and navigation
};
```

This component guides users through:
1. Initial setup options
2. Terms acceptance (if required)
3. Code generation for embedding

### 5.3 Public/Embedded Dashboard Container

The `PublicOrEmbeddedDashboard` component serves as the main container for public and embedded dashboards:

```typescript
const PublicOrEmbeddedDashboardInner = ({
  dashboard,
  parameters,
  parameterValues,
  // Many other props...
}: PublicOrEmbeddedDashboardProps) => {
  // Implementation for rendering public/embedded dashboards
};
```

This component handles:
- Loading the dashboard and its cards
- Managing parameters
- Handling user interactions
- Applying theme settings for embedded context

### 5.4 Data Loading for Embedded Content

Embedded visualizations load data through specialized paths:

```typescript
const initializeData = async ({
  dashboardId,
  shouldReload,
  parameterQueryParams,
  dispatch,
}: {
  dashboardId: string;
  shouldReload: boolean;
  parameterQueryParams: OwnProps["parameterQueryParams"];
  dispatch: DispatchFn;
}) => {
  // Implementation for loading dashboard data
};
```

The system handles:
- Loading dashboard metadata
- Fetching card data
- Applying parameters
- Error handling

## 6. User Interface Components

### 6.1 Download Button and Popover

The download UI is implemented in `QuestionDownloadPopover`:

```typescript
const QuestionDownloadPopover = ({
  className,
  question,
  result,
  // Other props...
}: QuestionDownloadPopoverProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const [, handleDownload] = useDownloadData({
    // Download options...
  });

  // Implementation for download popover UI
};
```

This component provides:
- A trigger button with tooltip
- A popover with format options
- Handling of the download action

### 6.2 PDF Export Button

PDF exports are initiated through specialized buttons:

```typescript
export const getExportTabAsPdfButtonText = (tabs: Dashboard["tabs"]) => {
  return Array.isArray(tabs) && tabs.length > 1
    ? t`Export tab as PDF`
    : t`Export as PDF`;
};
```

The export process is triggered from dashboard headers and adapts its UI based on whether the dashboard has tabs.

### 6.3 Subscribe Button and Sidebar

The subscription UI is accessed through a sidebar interface:

```jsx
<PulsesListSidebar
  pulses={pulses}
  formInput={formInput}
  createSubscription={this.createSubscription}
  onCancel={this.onCancel}
  editPulse={this.editPulse}
/>
```

This interface allows users to:
- View existing subscriptions
- Create new subscriptions
- Edit subscription settings
- Configure delivery schedules

## 7. Integration Points

### 7.1 Backend API Integration

The export and sharing features integrate with multiple backend APIs:

```typescript
// For PDF/image exports
const { default: html2canvas } = await import("html2canvas-pro");
const { default: jspdf } = await import("jspdf");

// For data exports
return POST(requestUrl, {
  formData: true,
  fetch: true,
  transformResponse: ({ response }: TransformResponseProps) =>
    checkNotNull(response),
})
```

These integrations include:
- HTML to canvas conversion
- PDF generation
- REST API calls for data formats
- Token generation for embedding

### 7.2 Analytics Tracking

Export actions are tracked for analytics:

```typescript
trackDownloadResults({
  resourceType,
  accessedVia,
  exportType: opts.type,
});
```

This provides insights into:
- Which export formats are popular
- How resources are being accessed
- Usage patterns across different contexts

### 7.3 Security Considerations

The system implements several security measures:

1. **Token-based authentication** for embedded content:
   ```typescript
   return KJUR.jws.JWS.sign(null, { alg: "HS256" }, unsignedToken, {
     utf8: secretKey,
   });
   ```

2. **Domain validation** for email recipients:
   ```typescript
   export function recipientIsValid(recipient: RecipientPickerValue) {
     // Domain validation logic
   }
   ```

3. **Resource access path detection** to apply appropriate security measures.

## 8. Conclusion

Metabase's visualization export and sharing system provides a comprehensive set of features for distributing data insights through multiple channels:

1. **Export Formats**:
   - PDF for dashboards
   - PNG for individual visualizations
   - CSV, XLSX, and JSON for raw data

2. **Delivery Mechanisms**:
   - Manual downloads
   - Scheduled email subscriptions
   - Slack channel delivery
   - Public links
   - Embedded visualizations

3. **Key Strengths**:
   - Multi-format support
   - Flexible scheduling options
   - Secure embedding capabilities
   - Adaptive UI for different contexts

The system effectively balances the needs for data distribution, visual fidelity, and security, enabling users to share insights both within and outside their organizations.