export interface AIEntityAnalysisResponse {
  summary: string;
}

export interface TimelineEventInfo {
  name: string;
  description?: string;
  timestamp: string;
}

export interface AIQuestionAnalysisParams {
  imageBase64: string;
  name?: string;
  description?: string;
  timelineEvents?: TimelineEventInfo[];
}

export interface AIDashboardAnalysisParams {
  imageBase64: string;
  name?: string;
  description?: string;
  tabName?: string;
}
