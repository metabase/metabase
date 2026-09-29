import type { FormEventHandler } from "react";
import { useState } from "react";
import { jt, t } from "ttag";

import { Box, Button, Flex, Icon, Stack } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../ExpressionWidget/ExpressionWidgetHeader";

import { ColumnAndSeparatorRow } from "./ColumnAndSeparatorRow";
import { Example } from "./Example";
import type { ColumnAndSeparator } from "./util";
import {
  flatten,
  formatSeparator,
  getDefaultSeparator,
  getExpressionName,
  getNextColumnAndSeparator,
} from "./util";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  onCancel?: () => void;
  onSubmit: (name: string, clause: Lib.ExpressionClause) => void;
  withTitle?: boolean;
  width?: number;

  /**
   * If set, use this as the first column to combine.
   */
  column?: Lib.ColumnMetadata;
}

type State = {
  columnsAndSeparators: ColumnAndSeparator[];
  isUsingDefaultSeparator: boolean;
  defaultSeparator: string;
};

export function CombineColumns({
  query,
  stageIndex,
  availableColumns,
  onCancel,
  onSubmit,
  width,
  column,
  withTitle,
}: Props) {
  return null;
}
