export type DashboardEvent = {
    onLoad?: () => void;
    // onRender: () => void;
    // onResize: () => void;
    // onClose: () => void;
    onError?: (error: unknown) => void;
    // onExport: () => void;
    // onChangeTab: (tabId: string) => void;
}