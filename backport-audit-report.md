# Backport audit: P0/P1 issues closed since 2026-05-01

_Generated 2026-07-06. Scope: 105 P0/P1 issues closed as completed since 2026-05-01 in metabase/metabase._

## Method

- Issues: closed `Priority:P0`/`Priority:P1` with `stateReason=COMPLETED` since 2026-05-01 (117 closed total; duplicates/not-planned excluded).
- Each issue resolved to its closing PR(s) via GitHub's closing references, falling back to cross-referenced merged PRs.
- A branch counts as covered if the fix commit is on it (branch cut after merge), a backport commit references the original PR number in its message, the closing PR targeted that release branch directly, or GitHub search found a **merged** backport PR (catches manual backports that omit the original PR number). Backports later reverted on a branch are counted as not covered (none in this set were).
- Expected branches: every release branch whose EOL (per the support-dates table) is on/after the fix's master merge date. For fixes merged in May 2026 that includes 54–57 (EOL 2026-05-31); from June onward only 58–62.

## Summary

| Category | Count |
|---|---|
| Fully backported to all expected branches | 11 |
| Missing on ≥1 currently-supported branch (58–62) | 72 |
| Missing only on now-EOL'd branches (54–57) | 2 |
| No linked fix PR (manual review needed) | 19 |
| Fixed outside metabase/metabase | 1 |

Missing-fix count per branch (all expected fixes):

| Branch | EOL | Missing fixes |
|---|---|---|
| release-x.54.x | 2026-05-31 | 43 |
| release-x.55.x | 2026-05-31 | 43 |
| release-x.56.x | 2026-05-31 | 43 |
| release-x.57.x | 2026-05-31 | 42 |
| release-x.58.x | 2027-02-17 (LTS) | 72 |
| release-x.59.x | 2026-09-01 | 56 |
| release-x.60.x | 2026-09-01 | 31 |
| release-x.61.x | 2026-09-01 | 21 |
| release-x.62.x | 2026-09-01 | 4 |

## Gaps on currently-supported branches (58–62)

`bot-closed` = the backport bot opened a PR for that branch and it was closed without merging (a person decided or CI failed). `none` = no backport PR was ever opened.

_“Versions in issue” = version numbers mentioned in the issue body — a rough applicability signal; an issue reported only on 62 may not need a 58 backport._

| Issue | Pri | Fixed | Fix PR(s) | Versions in issue | Missing (active) | Also missing (54–57, EOL'd) | Covered |
|---|---|---|---|---|---|---|---|
| [#70538](https://github.com/metabase/metabase/issues/70538) Can't resolve a comment, or add a subcomment, or add an emoji to a com | P1 | 2026-03-17 | #70802, #70832, #75763 | — | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#72868](https://github.com/metabase/metabase/issues/72868) Verified content Metabot setting not working | P1 | 2026-05-01 | #73498 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73389](https://github.com/metabase/metabase/issues/73389) Search endpoint pegs app DB CPU to 100% | P1 | 2026-05-01 | #73425 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73081](https://github.com/metabase/metabase/issues/73081) Transforms failures are not reported consistently | P1 | 2026-05-05 | #73108 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73298](https://github.com/metabase/metabase/issues/73298) No confirmation to disconnect AI provider | P1 | 2026-05-05 | #73658 | 60 | 58 (none), 59 (none), 61 (none) | 54, 55, 56, 57 | 60, 62 |
| [#73541](https://github.com/metabase/metabase/issues/73541) PermissionError in GraalVM Python breaking impersonated native queries | P1 | 2026-05-05 | #73638 | 60 | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73520](https://github.com/metabase/metabase/issues/73520) databases/schemas with all tables blocked showing as granular in datab | P1 | 2026-05-06 | #73675 | 60 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#73593](https://github.com/metabase/metabase/issues/73593) Native questions w/ impersonation: SQL parse errors result in a mislea | P1 | 2026-05-06 | #73665 | 60 | 58 (none), 59 (none), 60 (none), 61 (none) | 54, 55, 56, 57 | 62 |
| [#73721](https://github.com/metabase/metabase/issues/73721) Adding contains filter on column causes server error | P1 | 2026-05-07 | #73765 | 60 | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73758](https://github.com/metabase/metabase/issues/73758) Dashboard ID filter crashes on Postgres UUID field filter | P1 | 2026-05-07 | #73778 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73788](https://github.com/metabase/metabase/issues/73788) Impersonation in Snowflake fails if role name contains `-` (dash) | P1 | 2026-05-07 | #73800 | 60 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#73804](https://github.com/metabase/metabase/issues/73804) MySQL database settings stopped working on upgrade to v0.60.3.8 | P1 | 2026-05-07 | #73834 | 59, 60 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#73249](https://github.com/metabase/metabase/issues/73249) Permissions Update Fails with Cluster Lock Error | P1 | 2026-05-08 | #73694, #74734 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73690](https://github.com/metabase/metabase/issues/73690) Cannot create a chart using Metabot in a document | P1 | 2026-05-08 | #73750 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73736](https://github.com/metabase/metabase/issues/73736) BigQuery - dashboard cards intermittently fail [Dep/classpath weirdnes | P1 | 2026-05-08 | #73757, #74220, #74685 | 60 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#73803](https://github.com/metabase/metabase/issues/73803) Scatterplot drill-through omits categorical breakout filter on dashboa | P1 | 2026-05-08 | #73903 | 57, 58 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#73928](https://github.com/metabase/metabase/issues/73928) /browse/databases/:id freezes for schema-less databases (Mongo/MariaDB | P1 | 2026-05-11 | #73977 | 60, 61 | 58 (none), 59 (none), 60 (none) | 54, 55, 56, 57 | 61, 62 |
| [#71558](https://github.com/metabase/metabase/issues/71558) We show the "server issues" screen when the problem is on que query pr | P1 | 2026-05-12 | #74041, #74684 | — | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#71637](https://github.com/metabase/metabase/issues/71637) Native question with variables show generic server error instead of sy | P1 | 2026-05-12 | #74041 | 58, 59 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#72705](https://github.com/metabase/metabase/issues/72705) Allow overriding c3p0 app-db pool settings + support dynamic DB creden | P1 | 2026-05-12 | #74025 | 59 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#74047](https://github.com/metabase/metabase/issues/74047) Upgrade to 61 beta from 60 Fails | P1 | 2026-05-12 | #74053 | 61 | 58 (none), 59 (none), 60 (none) | 54, 55, 56, 57 | 61, 62 |
| [#72427](https://github.com/metabase/metabase/issues/72427) Search index reindex job throws duplicate upsert error | P1 | 2026-05-13 | #74160 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73792](https://github.com/metabase/metabase/issues/73792) search missing questions until i click on them since upgrading from 59 | P1 | 2026-05-13 | #74160 | 60 | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#74124](https://github.com/metabase/metabase/issues/74124) Upgrade to 61 beta from 60 Fails (again) | P1 | 2026-05-13 | #74127 | 61 | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73516](https://github.com/metabase/metabase/issues/73516) Confusing/Generic Server Error When DB Can't be Reached | P1 | 2026-05-15 | #74088 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#74290](https://github.com/metabase/metabase/issues/74290) Cannot setup sandboxing with a SQL question via the UI | P1 | 2026-05-15 | #74297 | — | 58 (none), 59 (none), 60 (none) | 54, 55, 56, 57 | 61, 62 |
| [#73880](https://github.com/metabase/metabase/issues/73880) Trying to push remote sync changes can fail with "No remote-syncable c | P1 | 2026-05-19 | #74187 | 61 | 58 (none), 59 (none), 60 (none), 61 (none) | 54, 55, 56, 57 | 62 |
| [#74289](https://github.com/metabase/metabase/issues/74289) Model persistence breaks with impersonation | P1 | 2026-05-19 | #74303 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#74417](https://github.com/metabase/metabase/issues/74417) Serialization import fails with H2 sample content present | P1 | 2026-05-19 | #74429 | — | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#73912](https://github.com/metabase/metabase/issues/73912) Conditional formatting colors missing from emaill / Slack subscription | P1 | 2026-05-20 | #74475 | 56, 60 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#74132](https://github.com/metabase/metabase/issues/74132) Browser console flooded with "Error getting setting graph.tooltip_colu | P1 | 2026-05-20 | #74237 | 60 | 58 (none), 59 (none), 60 (none), 61 (none) | 54, 55, 56, 57 | 62 |
| [#74412](https://github.com/metabase/metabase/issues/74412) Remote sync setup deadlocks on report_card when enabling sync on an in | P1 | 2026-05-20 | #74544 | 60 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#74425](https://github.com/metabase/metabase/issues/74425) Tables created with transforms cannot be imported using serialization | P1 | 2026-05-20 | #74473 | 61 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#74442](https://github.com/metabase/metabase/issues/74442) Existing database tables cannot be migrated to use transforms via seri | P1 | 2026-05-20 | #74474 | 61 | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#74443](https://github.com/metabase/metabase/issues/74443) Direct upgrade from v59 to v61 fails migration | P1 | 2026-05-20 | #74463, #74594 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#73339](https://github.com/metabase/metabase/issues/73339) A table configured with CLS can result in Invalid SQL Generation | P1 | 2026-05-21 | #74537 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#74599](https://github.com/metabase/metabase/issues/74599) Frontend errors are always posted to an invalid endpoint | P1 | 2026-05-22 | #74623 | 61 | 58 (none), 59 (none), 60 (none) | 54, 55, 56, 57 | 61, 62 |
| [#72921](https://github.com/metabase/metabase/issues/72921) Metabot: "Regenerate suggested prompts" fails | P1 | 2026-05-26 | #74359, #74356→59 | — | 58 (none) | 54, 55, 56, 57 | 59, 60, 61, 62 |
| [#74284](https://github.com/metabase/metabase/issues/74284) SQLGlot rewrites queries with null values | P1 | 2026-05-27 | #74440 | — | 58 (none), 59 (none) | 54, 55, 56, 57 | 60, 61, 62 |
| [#74571](https://github.com/metabase/metabase/issues/74571) Maximum update depth exceeded on Database page | P1 | 2026-05-29 | #71351 | — | 58 (none), 59 (none), 60 (none), 61 (none) | 54, 55, 56, 57 | 62 |
| [#74950](https://github.com/metabase/metabase/issues/74950) Upgrading from 55 to 57 messed up Pivot settings | P1 | 2026-05-29 | #74972 | 57 | 58 (none), 59 (none), 60 (none) | 54, 55, 56, 57 | 61, 62 |
| [#74860](https://github.com/metabase/metabase/issues/74860) `between` custom expression for timestamp columns does not include upp | P1 | 2026-06-02 | #74875 | 61 | 58 (none), 59 (none), 60 (none) | — | 61, 62 |
| [#75117](https://github.com/metabase/metabase/issues/75117) Some Japanese names in Custom Expression break when used as sorting in | P1 | 2026-06-04 | #75123 | 57, 61 | 58 (none), 59 (none), 60 (none) | — | 61, 62 |
| [#75187](https://github.com/metabase/metabase/issues/75187) API serialization export.log is always empty | P1 | 2026-06-04 | #75255 | — | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#75230](https://github.com/metabase/metabase/issues/75230) Serialization (Remote Sync) - Result Metadata is not extracted for Nat | P1 | 2026-06-04 | #75259 | 57, 61 | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#74542](https://github.com/metabase/metabase/issues/74542) Relative dates in SQL field filters use UTC date boundaries, not the r | P1 | 2026-06-08 | #75029 | 61 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#74561](https://github.com/metabase/metabase/issues/74561) Switching the database on SQL models will make dependant cards not to  | P1 | 2026-06-08 | #75268 | — | 58 (none), 59 (none), 60 (none), 61 (none), 62 (none) | — | — |
| [#74956](https://github.com/metabase/metabase/issues/74956) Removing Create queries permission on 1 Table in MYSQL removes permiss | P1 | 2026-06-08 | #74988 | 61 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#75252](https://github.com/metabase/metabase/issues/75252) Password login can't be disabled when OIDC is the only SSO provider | P1 | 2026-06-08 | #75361 | 61 | 58 (none), 59 (none), 60 (none) | — | 61, 62 |
| [#75310](https://github.com/metabase/metabase/issues/75310) Apache Druid transient errors | P1 | 2026-06-08 | #75350 | 61 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#75524](https://github.com/metabase/metabase/issues/75524) Investigate High CPU Utilization for Cloud Customer | P1 | 2026-06-09 | #75548 | — | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#75458](https://github.com/metabase/metabase/issues/75458) 62.x won't work with MariaDB (upgrade or new instance) | P1 | 2026-06-10 | #75496 | — | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#75570](https://github.com/metabase/metabase/issues/75570) Field Filters Broken for BigQuery | P1 | 2026-06-11 | #75644 | 60, 62 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#75748](https://github.com/metabase/metabase/issues/75748) Investigate OOMs on Dependency Checks | P1 | 2026-06-12 | #75769 | — | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#75752](https://github.com/metabase/metabase/issues/75752) Investigate customer instance restarts due to app DB connection exhaus | P1 | 2026-06-12 | #75770 | 60 | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#75757](https://github.com/metabase/metabase/issues/75757) Native SQL editor search ignores selected database | P1 | 2026-06-12 | #75772 | — | 58 (none), 59 (none), 60 (none) | — | 61, 62 |
| [#75929](https://github.com/metabase/metabase/issues/75929) MySQL/PlanetScale — upgrading to 1.62 marks all tables inactive; GUI q | P1 | 2026-06-17 | #75971 | 61, 62 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#60460](https://github.com/metabase/metabase/issues/60460) [Spike] Improve PDF exports performance | P1 | 2026-06-18 | #76016 | — | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#75144](https://github.com/metabase/metabase/issues/75144) API-created filters open Custom Expression editor | P1 | 2026-06-18 | #75998 | — | 58 (none), 59 (none), 60 (none), 61 (none), 62 (none) | — | — |
| [#75302](https://github.com/metabase/metabase/issues/75302) OIDC "Check connection" always fails for Microsoft Entra ID | P1 | 2026-06-18 | #75416 | 61 | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#76077](https://github.com/metabase/metabase/issues/76077) OOM during database sync: set-default-table-permissions! loads the ent | P1 | 2026-06-18 | #76100 | — | 58 (none), 59 (none), 60 (none) | — | 61, 62 |
| [#75604](https://github.com/metabase/metabase/issues/75604) Custom column type is not persisted after saving question based on an  | P1 | 2026-06-22 | #75663 | 62 | 58 (none), 59 (none), 60 (none) | — | 61, 62 |
| [#76174](https://github.com/metabase/metabase/issues/76174) Search results sorting degradation after recent changes | P1 | 2026-06-22 | #76190→62 | 62 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#76222](https://github.com/metabase/metabase/issues/76222) Table has no Fields associated with it (MySql) | P1 | 2026-06-22 | #76286 | 60 | 58 (none), 59 (none), 60 (none), 61 (none), 62 (none) | — | — |
| [#76304](https://github.com/metabase/metabase/issues/76304) Cannot delete a workspace with databases that are not :unprovisioned;  | P1 | 2026-06-25 | #76350 | — | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#76465](https://github.com/metabase/metabase/issues/76465) v0.62.3.x migration task_run_notification_id fails on MySQL with "Trun | P1 | 2026-06-25 | #76509 | 62 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#76510](https://github.com/metabase/metabase/issues/76510) v0.62.3 (and v0.62.2) doesn't migrate successfully with MySQL 8.4 (rev | P1 | 2026-06-25 | #76540 | 62 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#76542](https://github.com/metabase/metabase/issues/76542) unable to render this card on pdf subscription | P1 | 2026-06-29 | #76605 | — | 58 (none), 59 (none), 60 (none), 61 (none), 62 (none) | — | — |
| [#76511](https://github.com/metabase/metabase/issues/76511) Sdk - controlled parameters prop leaks into drill-through target dashb | P1 | 2026-07-01 | #76716 | 62 | 58 (none), 59 (none), 60 (none), 61 (none) | — | 62 |
| [#76585](https://github.com/metabase/metabase/issues/76585) ClickHouse: Day bucketing ignores the report timezone for model / nest | P1 | 2026-07-02 | #76697 | 62 | 58 (none), 59 (none) | — | 60, 61, 62 |
| [#76702](https://github.com/metabase/metabase/issues/76702) Embedding SDK: `MetabotQuestion` intermittently does not show the SQL  | P1 | 2026-07-02 | #76738 | 62 | 58 (none) | — | 59, 60, 61, 62 |
| [#76856](https://github.com/metabase/metabase/issues/76856) Query cache extends cache instead of updating it if refresh is interru | P1 | 2026-07-03 | #76898 | — | 58 (none), 59 (none) | — | 60, 61, 62 |

## Missing only on now-EOL'd 54–57

- [#71223](https://github.com/metabase/metabase/issues/71223) Visualizer breaks internal dimension remapping for integer Category fields (column renaming doesn't update `remapped_from` references) — fixed 2026-05-21 (#74446), missing from [54, 55, 56], covered [57, 58, 59, 60, 61, 62]
- [#73224](https://github.com/metabase/metabase/issues/73224) <metabase-dashboard> web component does not auto-resize to fit content (guest embedding, 1.58.11) — fixed 2026-04-29 (#73338), missing from [54, 55, 56, 57], covered [58, 59, 60, 61, 62]

## Fully backported to all expected branches

- [#74954](https://github.com/metabase/metabase/issues/74954) Instance hangs indefinitely on SearchIndexReindex job - no crash, health check green, Quartz misfires — fixed 2026-06-03, covered [58, 59, 60, 61, 62]
- [#75305](https://github.com/metabase/metabase/issues/75305) Mongo RLS users lose access to view Object Type columns — fixed 2026-06-11, covered [58, 59, 60, 61, 62]
- [#75334](https://github.com/metabase/metabase/issues/75334) Security center won't work advisories with patch versions — fixed 2026-06-08, covered [58, 59, 60, 61, 62]
- [#75579](https://github.com/metabase/metabase/issues/75579) Athena Driver fails to sync fields for partitioned tables — fixed 2026-06-11, covered [58, 59, 60, 61, 62]
- [#75602](https://github.com/metabase/metabase/issues/75602) Download diagnostics — dashboard definition never included — fixed 2026-06-18, covered [58, 59, 60, 61, 62]
- [#76044](https://github.com/metabase/metabase/issues/76044) Metrics don't work for users in a Customer RCLS Permission Group — fixed 2026-06-22, covered [58, 59, 60, 61, 62]
- [#76136](https://github.com/metabase/metabase/issues/76136) Hiding a table column via dashboard card Visualization Options does not persist after clicking Done — fixed 2026-06-29, covered [58, 59, 60, 61, 62]
- [#76249](https://github.com/metabase/metabase/issues/76249) Dashboard filter not showing dropdown on remote synced collection — fixed 2026-06-25, covered [58, 59, 60, 61, 62]
- [#76710](https://github.com/metabase/metabase/issues/76710) Query on tableA fails when tableA has FK to tableB and user lacks Create queries on tableB — fixed 2026-06-30, covered [58, 59, 60, 61, 62]
- [#76722](https://github.com/metabase/metabase/issues/76722) [mongodb double join] invalid character for a variable name: ':'' — fixed 2026-07-02, covered [58, 59, 60, 61, 62]
- [#76758](https://github.com/metabase/metabase/issues/76758) Add more info to "Request canceled before finishing" exception — fixed 2026-07-03, covered [58, 59, 60, 61, 62]

## Closed as completed but no linked fix PR (manual review)

- [#71378](https://github.com/metabase/metabase/issues/71378) [P1] Model section is not showing Models (closed 2026-06-29)
- [#71703](https://github.com/metabase/metabase/issues/71703) [P1] axios@1.14.1 and axios@0.30.4 are compromised. Metabase has an unpinned axios version that could resolve to 1.14.1 (closed 2026-05-05)
- [#72430](https://github.com/metabase/metabase/issues/72430) [P1] Alerts fail to send due to permission error (closed 2026-06-01)
- [#73196](https://github.com/metabase/metabase/issues/73196) [P1] GraalPython execution in clojure-agent-send-off-pool causes OOM via huge Python list materialization (closed 2026-05-12)
- [#73382](https://github.com/metabase/metabase/issues/73382) [P1] Investigate Performance Degradation on Permission Checks (closed 2026-05-04)
- [#73453](https://github.com/metabase/metabase/issues/73453) [P1] Intermittent customer-facing 404s on hosted instances (closed 2026-06-10)
- [#73560](https://github.com/metabase/metabase/issues/73560) [P1] Oracle driver fails to load in v1.60.3.5+ (closed 2026-05-07)
- [#73619](https://github.com/metabase/metabase/issues/73619) [P1] Metabot SQL query creation fails with FileSystemAlreadyExistsException (closed 2026-05-20)
- [#73645](https://github.com/metabase/metabase/issues/73645) [P1] Cards get deleted after Metabase Cloud Storage database change/pod restart (v1.60.3.6 to v1.60.3.8) (closed 2026-05-08)
- [#73781](https://github.com/metabase/metabase/issues/73781) [P1] MCP server struggles to handle questions with joins (closed 2026-06-08)
- [#74008](https://github.com/metabase/metabase/issues/74008) [P1] Model result metadata is not updated when underlying table is updated, breaking queries affected by RLS (closed 2026-05-11)
- [#74405](https://github.com/metabase/metabase/issues/74405) [P1] App crashes after selecting question for sandboxing (closed 2026-05-20)
- [#74765](https://github.com/metabase/metabase/issues/74765) [P1] Metabot sometimes can't see databases or tables when it clearly should (closed 2026-05-27)
- [#75064](https://github.com/metabase/metabase/issues/75064) [P1] Search Sometimes Doesn't Return Results (closed 2026-06-29)
- [#76149](https://github.com/metabase/metabase/issues/76149) [P1] H2 dump leaves some columns encrypted (closed 2026-06-23)
- [#76386](https://github.com/metabase/metabase/issues/76386) [P1] BigQuery field sync fails with ISeq error (closed 2026-06-24)
- [#76395](https://github.com/metabase/metabase/issues/76395) [P1] BigQuery CSV download truncates silently on large result sets (closed 2026-06-24)
- [#76564](https://github.com/metabase/metabase/issues/76564) [P1] setup-token exposed again in /api/session/properties after setup is complete (regression in 1.62.2) (closed 2026-06-30)
- [#77093](https://github.com/metabase/metabase/issues/77093) [P1] Metabot: claude-sonnet-5 crashes agent loop with "No matching clause: :thinking" (closed 2026-07-06)

## Fixed outside this repo

- [#76243](https://github.com/metabase/metabase/issues/76243) Updates section in Admin page fails to show embedded release notes and changelog — fixed in metabase/metabase.github.io#5957 (website), no backport applicable

## Caveats

- Applicability is not verified per-issue: a fix for a bug introduced in v61 does not need a 58 backport even though this audit lists it as a gap. The 'Versions in issue' column helps triage but each gap on 58/59 should be checked against when the bug was introduced.
- Issues closed since 2026-05-01 whose fixes merged earlier are included; the mandate window is interpreted as issue-close date.
- Open (unmerged) backport PRs would appear as gaps; none were found open for these fixes at audit time.