export type GraphNodeModel =
  | "question"
  | "model"
  | "metric"
  | "table"
  | "dashboard"
  | "transform"
  | "collection"
  | "segment"
  | "measure"
  | "snippet"
  | "document"
  | "action"
  | "database"
  | "field";

export interface DependentsCount {
  question?: number;
  model?: number;
  metric?: number;
  table?: number;
  dashboard?: number;
  transform?: number;
  collection?: number;
  segment?: number;
  measure?: number;
  snippet?: number;
  document?: number;
}

export interface GraphViewField {
  name: string;
  semanticType: string | null;
}

export interface GraphViewNode {
  key: string;
  model: GraphNodeModel;
  name: string;
  description: string | null;
  filePath: string;
  cardType?: string;
  queryType?: string;
  display?: string;
  createdAt?: string | null;
  collectionId?: string | null;
  dependentsCount: DependentsCount;
  fields?: GraphViewField[];
  incomingCount: number;
  outgoingCount: number;
}

export interface GraphViewEdge {
  sourceKey: string;
  targetKey: string;
  referenceType: string;
}

export type ExtensionToWebviewMessage =
  | {
      type: "init";
      configExists: boolean;
      nodes: GraphViewNode[];
      edges: GraphViewEdge[];
      issueCount: number;
      cycleCount: number;
    }
  | {
      type: "configExistsChanged";
      configExists: boolean;
    }
  | {
      type: "themeChanged";
      colorMode: "light" | "dark";
    }
  | {
      type: "focusNode";
      nodeKey: string;
    };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openFile"; filePath: string }
  | { type: "selectNode"; key: string };
