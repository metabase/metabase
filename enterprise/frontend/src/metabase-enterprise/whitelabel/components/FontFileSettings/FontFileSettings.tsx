import React from "react";
import { FontFileOption } from "./types";

export interface FontFileSettingsProps {
  urls: Record<number, string>;
  options: FontFileOption[];
}
