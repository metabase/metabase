## Properties

| Property | Type |
| ------ | ------ |
| <a id="_domid"></a> `_domId?` | `string` \| `number` |
| <a id="action"></a> `action?` | `null` \| () => `void` |
| <a id="actionlabel"></a> `actionLabel?` | `string` |
| <a id="actions"></a> `actions?` | () => `void`[] |
| <a id="candismiss"></a> `canDismiss?` | `boolean` |
| <a id="count"></a> `count?` | `number` |
| <a id="dismissiconcolor"></a> `dismissIconColor?` | `string` |
| <a id="extrainfo"></a> `extraInfo?` | \{ `dashcardIds`: `number`[]; `tabId`: `number`; \} & `Record`\<`string`, `unknown`\> |
| <a id="icon"></a> `icon?` | \| `null` \| `"string"` \| `"number"` \| `"function"` \| `"area"` \| `"embed"` \| `"link"` \| `"eye"` \| `"search"` \| `"sort"` \| `"filter"` \| `"refresh"` \| `"label"` \| `"progress"` \| `"section"` \| `"table"` \| `"document"` \| `"close"` \| `"location"` \| `"click"` \| `"copy"` \| `"pause"` \| `"play"` \| `"int"` \| `"return"` \| `"fields"` \| `"key"` \| `"empty"` \| `"check"` \| `"line"` \| `"unknown"` \| `"list"` \| `"lines"` \| `"warning"` \| `"info"` \| `"tab"` \| `"database"` \| `"field"` \| `"segment"` \| `"metric"` \| `"snippet"` \| `"dashboard"` \| `"pulse"` \| `"collection"` \| `"question"` \| `"variable"` \| `"share"` \| `"sum"` \| `"breakout"` \| `"index"` \| `"external"` \| `"model"` \| `"history"` \| `"move"` \| `"person"` \| `"extract"` \| `"split"` \| `"revert"` \| `"grid"` \| `"alert"` \| `"group"` \| `"add"` \| `"ellipsis"` \| `"clone"` \| `"bar"` \| `"add_column"` \| `"add_data"` \| `"add_row"` \| `"add_to_dash"` \| `"ai"` \| `"alert_filled"` \| `"alert_confirm"` \| `"archive"` \| `"attachment"` \| `"arrow_up"` \| `"arrow_down"` \| `"arrow_left"` \| `"arrow_left_to_line"` \| `"arrow_right"` \| `"arrow_split"` \| `"audit"` \| `"badge"` \| `"bell"` \| `"birthday"` \| `"bookmark"` \| `"bookmark_filled"` \| `"bolt"` \| `"bolt_filled"` \| `"bubble"` \| `"burger"` \| `"calendar"` \| `"chevrondown"` \| `"chevronleft"` \| `"chevronright"` \| `"chevronup"` \| `"clipboard"` \| `"clock"` \| `"cloud"` \| `"cloud_filled"` \| `"compare"` \| `"combine"` \| `"connections"` \| `"contract"` \| `"curved"` \| `"dash"` \| `"curve"` \| `"download"` \| `"dyno"` \| `"edit_document"` \| `"enter_or_return"` \| `"expand"` \| `"expand_arrow"` \| `"eye_crossed_out"` \| `"eye_outline"` \| `"bug"` \| `"format_code"` \| `"formula"` \| `"funnel"` \| `"funnel_outline"` \| `"folder"` \| `"folder_filled"` \| `"gauge"` \| `"gear"` \| `"gem"` \| `"globe"` \| `"grabber"` \| `"google"` \| `"google_drive"` \| `"google_sheet"` \| `"home"` \| `"horizontal_bar"` \| `"hourglass"` \| `"info_filled"` \| `"info_outline"` \| `"insight"` \| `"io"` \| `"join_full_outer"` \| `"join_inner"` \| `"join_left_outer"` \| `"join_right_outer"` \| `"ldap"` \| `"learn"` \| `"lightbulb"` \| `"lineandbar"` \| `"line_style_dashed"` \| `"line_style_dotted"` \| `"line_style_solid"` \| `"lock"` \| `"lock_filled"` \| `"mail"` \| `"mail_filled"` \| `"model_with_badge"` \| `"moon"` \| `"move_card"` \| `"new_folder"` \| `"notebook"` \| `"palette"` \| `"pencil"` \| `"pencil_lines"` \| `"permissions_limited"` \| `"pie"` \| `"pin"` \| `"pinmap"` \| `"pivot_table"` \| `"play_outlined"` \| `"popover"` \| `"popular"` \| `"recents"` \| `"sankey"` \| `"sql"` \| `"subscription"` \| `"straight"` \| `"stepped"` \| `"sort_arrows"` \| `"sync"` \| `"reference"` \| `"refresh_downstream"` \| `"rocket"` \| `"ruler"` \| `"shield"` \| `"sidebar_closed"` \| `"sidebar_open"` \| `"slack"` \| `"slack_colorized"` \| `"smartscalar"` \| `"sparkles"` \| `"star_filled"` \| `"star"` \| `"store"` \| `"sun"` \| `"t-shirt"` \| `"table2"` \| `"time_history"` \| `"trash"` \| `"trash_filled"` \| `"triangle_left"` \| `"triangle_right"` \| `"unarchive"` \| `"unpin"` \| `"unsubscribe"` \| `"upload"` \| `"verified"` \| `"official_collection"` \| `"verified_filled"` \| `"view_archive"` \| `"warning_round_filled"` \| `"waterfall"` \| `"webhook"` \| `"10k"` \| `"1m"` \| `"zoom_in"` \| `"zoom_out"` \| `"scalar"` \| `"cake"` \| `"table_spaced"` \| `"beaker"` \| `"eye_filled"` |
| <a id="id"></a> `id` | `string` \| `number` |
| <a id="initialtimeout"></a> `initialTimeout?` | `number` |
| <a id="message"></a> `message?` | `string` \| (`undo`: [`Undo`](Undo.md)) => `string` |
| <a id="pausedat"></a> `pausedAt?` | `null` \| `number` |
| <a id="showprogress"></a> `showProgress?` | `boolean` |
| <a id="startedat"></a> `startedAt?` | `number` |
| <a id="subject"></a> `subject?` | `string` |
| <a id="timeout"></a> `timeout?` | `number` |
| <a id="timeoutid"></a> `timeoutId` | `null` \| `number` |
| <a id="toastcolor"></a> `toastColor?` | `string` |
| <a id="type"></a> `type?` | `string` |
| <a id="verb"></a> `verb?` | `string` |
