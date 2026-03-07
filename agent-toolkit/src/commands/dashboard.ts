import { randomUUID } from "crypto";
import type { Command } from "commander";
import type { GlobalContext } from "../index.js";
import { FieldResolver } from "../core/field-resolver.js";
import { printResult } from "../core/output.js";
import {
  AddCardToDashboardInputSchema,
  CreateDashboardInputSchema,
} from "../core/schemas.js";
import { CliError, validatePositiveInt } from "../core/validation.js";

const GRID_WIDTH = 24;

interface CardLayout {
  card_id: number;
  width: number;
  height: number;
  row: number;
  col: number;
}

/**
 * Auto-layout cards left-to-right, wrapping at grid width.
 */
function autoLayout(
  cards: Array<{
    card_id: number;
    width: number;
    height: number;
    row?: number;
    col?: number;
  }>,
  startRow = 0,
): CardLayout[] {
  let currentRow = startRow;
  let currentCol = 0;
  let maxHeightInRow = 0;

  return cards.map((card) => {
    // If explicit position given, use it
    if (card.row !== undefined && card.col !== undefined) {
      return {
        card_id: card.card_id,
        width: card.width,
        height: card.height,
        row: card.row,
        col: card.col,
      };
    }

    // Auto-layout: wrap if card doesn't fit
    if (currentCol + card.width > GRID_WIDTH) {
      currentRow += maxHeightInRow;
      currentCol = 0;
      maxHeightInRow = 0;
    }

    const layout: CardLayout = {
      card_id: card.card_id,
      width: card.width,
      height: card.height,
      row: currentRow,
      col: currentCol,
    };

    currentCol += card.width;
    maxHeightInRow = Math.max(maxHeightInRow, card.height);

    return layout;
  });
}

/**
 * Resolve a field name to a numeric field ID for a given card.
 * Fetches the card to find its table_id, then resolves the field.
 */
async function resolveCardField(
  ctx: GlobalContext,
  resolver: FieldResolver,
  cardId: number,
  fieldName: string,
): Promise<number> {
  // Get the card to find its source table
  const { data } = await ctx.client.GET(`/api/card/${cardId}`);
  const card = data as Record<string, unknown>;
  const query = card.dataset_query as Record<string, unknown>;

  // For native queries, we need the result_metadata to find field IDs
  // For MBQL queries, we can get the source table
  if (query?.type === "native") {
    // For native queries, field mapping works differently
    // We need to look at result_metadata for column names
    const resultMeta = card.result_metadata as
      | Array<Record<string, unknown>>
      | undefined;
    if (resultMeta) {
      const col = resultMeta.find(
        (c) =>
          (c.name as string)?.toLowerCase() === fieldName.toLowerCase() ||
          (c.display_name as string)?.toLowerCase() ===
            fieldName.toLowerCase(),
      );
      if (col?.id && typeof col.id === "number") {
        return col.id;
      }
    }
    // For native SQL cards, return the field name as-is for dimension target
    // Dashboard parameter mapping can use column name directly
    throw new CliError("field_resolution", {
      message: `Cannot resolve field '${fieldName}' on native SQL card ${cardId}`,
      hint: "For SQL cards, dashboard filter mapping requires the card to have been run at least once so result metadata is available.",
    });
  }

  // MBQL query - get source table
  const innerQuery = query?.query as Record<string, unknown> | undefined;
  const tableId = innerQuery?.["source-table"] as number | undefined;
  if (!tableId) {
    throw new CliError("field_resolution", {
      message: `Cannot determine source table for card ${cardId}`,
    });
  }

  return resolver.resolve(tableId, fieldName);
}

export function registerDashboardCommands(
  program: Command,
  withContext: (
    fn: (ctx: GlobalContext, ...args: unknown[]) => Promise<void>,
  ) => (...args: unknown[]) => Promise<void>,
) {
  program
    .command("create-dashboard")
    .description(
      "Create a dashboard with cards and filters in one step",
    )
    .requiredOption(
      "--json <payload>",
      "JSON input (see: schema create-dashboard)",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = CreateDashboardInputSchema.parse(
          JSON.parse(options.json),
        );

        // Step 1: Create the dashboard
        const createPayload = {
          name: input.name,
          ...(input.description && { description: input.description }),
          ...(input.collection_id && { collection_id: input.collection_id }),
        };

        // Build parameters from filters
        const parameters = (input.filters ?? []).map((f) => ({
          id: randomUUID().slice(0, 8),
          name: f.name,
          type: f.type,
          slug: f.name.toLowerCase().replace(/\s+/g, "_"),
        }));

        if (ctx.dryRun) {
          const layouts = autoLayout(
            (input.cards ?? []).map((c) => ({
              card_id: c.card_id,
              width: c.width ?? 6,
              height: c.height ?? 4,
              row: c.row,
              col: c.col,
            })),
          );
          printResult({
            dry_run: true,
            api_calls: [
              {
                method: "POST",
                path: "/api/dashboard",
                body: { ...createPayload, parameters },
              },
              ...(input.cards?.length
                ? [
                    {
                      method: "PUT",
                      path: "/api/dashboard/{id}",
                      body: {
                        dashcards: layouts.map((l) => ({
                          id: -1,
                          card_id: l.card_id,
                          size_x: l.width,
                          size_y: l.height,
                          row: l.row,
                          col: l.col,
                        })),
                        parameters,
                      },
                    },
                  ]
                : []),
            ],
          });
          return;
        }

        const { data: dashboard } = await ctx.client.POST("/api/dashboard", {
          body: { ...createPayload, parameters } as never,
        });

        const dashboardResult = dashboard as Record<string, unknown>;
        const dashboardId = dashboardResult.id as number;

        // Step 2: Add cards if provided
        if (input.cards?.length) {
          const layouts = autoLayout(
            input.cards.map((c) => ({
              card_id: c.card_id,
              width: c.width ?? 6,
              height: c.height ?? 4,
              row: c.row,
              col: c.col,
            })),
          );

          // Resolve filter field mappings
          const resolver = new FieldResolver(ctx.client);
          const dashcards = await Promise.all(
            layouts.map(async (layout, _idx) => {
              const parameterMappings: Array<Record<string, unknown>> = [];

              // Wire filters to this card
              if (input.filters) {
                for (let fi = 0; fi < input.filters.length; fi++) {
                  const filter = input.filters[fi];
                  const target = filter.targets.find(
                    (t) => t.card_id === layout.card_id,
                  );
                  if (target) {
                    try {
                      const fieldId = await resolveCardField(
                        ctx,
                        resolver,
                        target.card_id,
                        target.field,
                      );
                      parameterMappings.push({
                        parameter_id: parameters[fi].id,
                        card_id: layout.card_id,
                        target: ["dimension", ["field", fieldId, null]],
                      });
                    } catch {
                      // For native SQL cards, use column name target
                      parameterMappings.push({
                        parameter_id: parameters[fi].id,
                        card_id: layout.card_id,
                        target: [
                          "dimension",
                          ["field", target.field, { "base-type": "type/Text" }],
                        ],
                      });
                    }
                  }
                }
              }

              return {
                id: -(layout.card_id), // negative = new dashcard
                card_id: layout.card_id,
                size_x: layout.width,
                size_y: layout.height,
                row: layout.row,
                col: layout.col,
                parameter_mappings: parameterMappings,
              };
            }),
          );

          await ctx.client.PUT(`/api/dashboard/${dashboardId}`, {
            body: { dashcards, parameters } as never,
          });
        }

        printResult({
          id: dashboardId,
          name: input.name,
          cards_added: input.cards?.length ?? 0,
          filters_added: input.filters?.length ?? 0,
        });
      }),
    );

  program
    .command("add-card-to-dashboard")
    .description("Add a card to an existing dashboard")
    .requiredOption(
      "--json <payload>",
      "JSON input (see: schema add-card-to-dashboard)",
    )
    .action(
      withContext(async (ctx, opts: unknown) => {
        const options = opts as { json: string };
        const input = AddCardToDashboardInputSchema.parse(
          JSON.parse(options.json),
        );

        // Get existing dashboard
        const { data: dashboard } = await ctx.client.GET(
          `/api/dashboard/${input.dashboard_id}`,
        );

        const dashData = dashboard as Record<string, unknown>;
        const existingDashcards =
          (dashData.dashcards as Array<Record<string, unknown>>) ?? [];
        const existingParams =
          (dashData.parameters as Array<Record<string, unknown>>) ?? [];

        // Find next available position
        let maxBottom = 0;
        for (const dc of existingDashcards) {
          const bottom =
            ((dc.row as number) ?? 0) + ((dc.size_y as number) ?? 4);
          maxBottom = Math.max(maxBottom, bottom);
        }

        // Build parameter mappings
        const parameterMappings: Array<Record<string, unknown>> = [];
        if (input.filter_mappings) {
          const resolver = new FieldResolver(ctx.client);
          for (const mapping of input.filter_mappings) {
            const param = existingParams.find(
              (p) =>
                (p.name as string)?.toLowerCase() ===
                mapping.filter_name.toLowerCase(),
            );
            if (!param) {
              throw new CliError("unknown_filter", {
                message: `Filter '${mapping.filter_name}' not found on dashboard ${input.dashboard_id}`,
                hint: `Available filters: ${existingParams.map((p) => p.name).join(", ")}`,
              });
            }
            try {
              const fieldId = await resolveCardField(
                ctx,
                resolver,
                input.card_id,
                mapping.field,
              );
              parameterMappings.push({
                parameter_id: param.id,
                card_id: input.card_id,
                target: ["dimension", ["field", fieldId, null]],
              });
            } catch {
              parameterMappings.push({
                parameter_id: param.id,
                card_id: input.card_id,
                target: [
                  "dimension",
                  ["field", mapping.field, { "base-type": "type/Text" }],
                ],
              });
            }
          }
        }

        const newDashcard = {
          id: -(input.card_id),
          card_id: input.card_id,
          size_x: input.width ?? 6,
          size_y: input.height ?? 4,
          row: maxBottom,
          col: 0,
          parameter_mappings: parameterMappings,
        };

        const allDashcards = [
          ...existingDashcards.map((dc) => ({
            id: dc.id,
            card_id: dc.card_id,
            size_x: dc.size_x,
            size_y: dc.size_y,
            row: dc.row,
            col: dc.col,
            parameter_mappings: dc.parameter_mappings ?? [],
          })),
          newDashcard,
        ];

        await ctx.client.PUT(`/api/dashboard/${input.dashboard_id}`, {
          body: { dashcards: allDashcards } as never,
        });

        printResult({
          dashboard_id: input.dashboard_id,
          card_id: input.card_id,
          position: { row: maxBottom, col: 0 },
        });
      }),
    );

  program
    .command("get-dashboard <id>")
    .description("Get a dashboard with all its cards")
    .action(
      withContext(async (ctx, id: unknown) => {
        const dashId = validatePositiveInt(id, "dashboard id");
        const { data } = await ctx.client.GET(
          `/api/dashboard/${dashId}`,
        );

        const raw = data as Record<string, unknown>;
        const dashcards =
          (raw.dashcards as Array<Record<string, unknown>>) ?? [];

        const compact = {
          id: raw.id,
          name: raw.name,
          description: raw.description,
          parameters: raw.parameters,
          cards: dashcards.map((dc) => ({
            dashcard_id: dc.id,
            card_id: dc.card_id,
            card_name: (dc.card as Record<string, unknown> | undefined)?.name,
            size_x: dc.size_x,
            size_y: dc.size_y,
            row: dc.row,
            col: dc.col,
          })),
        };

        printResult(compact, ctx.outputOpts);
      }),
    );
}
