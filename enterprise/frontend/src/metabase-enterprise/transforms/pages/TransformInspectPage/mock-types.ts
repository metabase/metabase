import type {
  TransformSourceMock,
  TransformTargetMock,
} from "./components/InspectSummaryMock";

export interface TransformLens {
  id: string;
  "display-name": string;
  description: string;
}

export interface TransformInspectResponse {
  name: string;
  sources: TransformSourceMock[];
  target: TransformTargetMock;
  "available-lenses": TransformLens[];
}
