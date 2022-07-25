import React from "react";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";
import { ActionMenuProps } from "./ActionMenu";

const getProps = (opts?: Partial<ActionMenuProps>): ActionMenuProps => ({
  item: createMockCollectionItem(),
  collection: createMockCollection(),
  onCopy: jest.fn(),
  onMove: jest.fn(),
});
