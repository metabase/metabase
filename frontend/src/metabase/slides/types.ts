import type { JSONContent } from "@tiptap/core";

import type { CollectionId, UserId } from "metabase-types/api";

export type SlideId = string;

export type SlideLayout =
  | "default"
  | "cover"
  | "closing"
  | "bullets"
  | "big_number"
  | "chart"
  | "two_column";

export interface Slide {
  id: SlideId;
  doc: JSONContent;
  layout?: SlideLayout;
}

export interface SlidesDeck {
  id: number;
  entity_id: string;
  name: string;
  slides: Slide[];
  creator_id: UserId;
  collection_id: CollectionId | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSlidesRequest {
  name: string;
  slides?: Slide[];
  collection_id?: CollectionId | null;
}

export interface UpdateSlidesRequest {
  id: number;
  name?: string;
  slides?: Slide[];
  collection_id?: CollectionId | null;
  archived?: boolean;
}

export interface GenerateSlidesRequest {
  prompt: string;
  card_ids?: number[];
  dashboard_ids?: number[];
}

export interface GenerateSlidesResponse {
  name: string;
  slides: Slide[];
}
