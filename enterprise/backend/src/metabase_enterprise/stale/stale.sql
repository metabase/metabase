-- Queries for the stale-content finder. Private sqlvec builders wrapped into executors in
-- metabase-enterprise.stale.stale-queries; see metabase.app-db.hugsql. Literal SQL only; every
-- input flows through a :value: param. Portable across H2, MySQL, Postgres.
--
-- The Card and Dashboard arms are UNION ALL'd literally rather than assembled at runtime: the only
-- caller searches both, so the statement is a constant.
--
-- Setting-driven WHERE toggles (embedding, public-sharing) are int flags (1 = on) instead of
-- Clojure `when` fragments. That keeps the statement static AND gives Postgres a type for the
-- param, which a bare `? IS NULL` does not.
--
-- Collection scoping: :collection-ids is the IN list (never empty -- see app-db.hugsql/non-empty-in)
-- and :include-null-collection = 1 additionally matches rows in the root (NULL) collection.

-- :name- stale-rows :? :*
-- Sorting: ORDER BY cannot take a bound param (`ORDER BY ?` sorts every row by the same constant),
-- and :i: identifier splicing is disarmed, so both sort keys are written literally and selected by
-- CASE on the :sort-by-name / :ascending int flags. sort-column and sort-direction are [:enum]s
-- validated upstream, so these four arms are total. The three unselected CASEs are NULL for every
-- row, making them ties that contribute no ordering.
--
-- NULLs in the live key are left to the database's default placement (Postgres: last on ASC;
-- H2/MySQL: first), matching the plain `ORDER BY` this replaced. Do not add NULLS LAST here without
-- intending a behavior change.
SELECT id, model
FROM (SELECT report_card.id,
             'Card' AS model,
             report_card.name AS name,
             report_card.last_used_at AS last_used_at
      FROM report_card
      LEFT JOIN moderation_review ON moderation_review.moderated_item_id = report_card.id
                                 AND moderation_review.moderated_item_type = 'card'
                                 AND moderation_review.most_recent = TRUE
                                 AND moderation_review.status = 'verified'
      LEFT JOIN pulse_card ON pulse_card.card_id = report_card.id
      LEFT JOIN pulse ON pulse_card.pulse_id = pulse.id AND pulse.archived = FALSE
      LEFT JOIN sandboxes ON sandboxes.card_id = report_card.id
      LEFT JOIN collection ON collection.id = report_card.collection_id
      WHERE sandboxes.id IS NULL
        AND pulse.id IS NULL
        AND moderation_review.id IS NULL
        AND report_card.archived = FALSE
        AND report_card.last_used_at <= :value:cutoff-date
        AND collection.type IS NULL
        AND (:value:embedding-on = 0 OR report_card.enable_embedding = FALSE)
        AND (:value:public-sharing-on = 0 OR report_card.public_uuid IS NULL)
        AND (report_card.collection_id IN (:value*:collection-ids)
             OR (:value:include-null-collection = 1 AND report_card.collection_id IS NULL))
      UNION ALL
      SELECT report_dashboard.id,
             'Dashboard' AS model,
             report_dashboard.name AS name,
             report_dashboard.last_viewed_at AS last_used_at
      FROM report_dashboard
      LEFT JOIN pulse ON pulse.archived = FALSE AND pulse.dashboard_id = report_dashboard.id
      LEFT JOIN collection ON collection.id = report_dashboard.collection_id
      LEFT JOIN moderation_review ON moderation_review.moderated_item_id = report_dashboard.id
                                 AND moderation_review.moderated_item_type = 'dashboard'
                                 AND moderation_review.most_recent = TRUE
                                 AND moderation_review.status = 'verified'
      WHERE pulse.id IS NULL
        AND moderation_review.id IS NULL
        AND report_dashboard.archived = FALSE
        AND report_dashboard.last_viewed_at <= :value:cutoff-date
        AND collection.type IS NULL
        AND (:value:embedding-on = 0 OR report_dashboard.enable_embedding = FALSE)
        AND (:value:public-sharing-on = 0 OR report_dashboard.public_uuid IS NULL)
        AND (report_dashboard.collection_id IN (:value*:collection-ids)
             OR (:value:include-null-collection = 1 AND report_dashboard.collection_id IS NULL))) stale
ORDER BY CASE WHEN :value:sort-by-name = 1 AND :value:ascending = 1 THEN LOWER(name) END ASC,
         CASE WHEN :value:sort-by-name = 1 AND :value:ascending = 0 THEN LOWER(name) END DESC,
         CASE WHEN :value:sort-by-name = 0 AND :value:ascending = 1 THEN last_used_at END ASC,
         CASE WHEN :value:sort-by-name = 0 AND :value:ascending = 0 THEN last_used_at END DESC
LIMIT :value:limit OFFSET :value:offset

-- :name- stale-total :? :1
-- Total matching rows, ignoring limit/offset/sort. Same two arms as stale-rows.
SELECT COUNT(*) AS count
FROM (SELECT report_card.id
      FROM report_card
      LEFT JOIN moderation_review ON moderation_review.moderated_item_id = report_card.id
                                 AND moderation_review.moderated_item_type = 'card'
                                 AND moderation_review.most_recent = TRUE
                                 AND moderation_review.status = 'verified'
      LEFT JOIN pulse_card ON pulse_card.card_id = report_card.id
      LEFT JOIN pulse ON pulse_card.pulse_id = pulse.id AND pulse.archived = FALSE
      LEFT JOIN sandboxes ON sandboxes.card_id = report_card.id
      LEFT JOIN collection ON collection.id = report_card.collection_id
      WHERE sandboxes.id IS NULL
        AND pulse.id IS NULL
        AND moderation_review.id IS NULL
        AND report_card.archived = FALSE
        AND report_card.last_used_at <= :value:cutoff-date
        AND collection.type IS NULL
        AND (:value:embedding-on = 0 OR report_card.enable_embedding = FALSE)
        AND (:value:public-sharing-on = 0 OR report_card.public_uuid IS NULL)
        AND (report_card.collection_id IN (:value*:collection-ids)
             OR (:value:include-null-collection = 1 AND report_card.collection_id IS NULL))
      UNION ALL
      SELECT report_dashboard.id
      FROM report_dashboard
      LEFT JOIN pulse ON pulse.archived = FALSE AND pulse.dashboard_id = report_dashboard.id
      LEFT JOIN collection ON collection.id = report_dashboard.collection_id
      LEFT JOIN moderation_review ON moderation_review.moderated_item_id = report_dashboard.id
                                 AND moderation_review.moderated_item_type = 'dashboard'
                                 AND moderation_review.most_recent = TRUE
                                 AND moderation_review.status = 'verified'
      WHERE pulse.id IS NULL
        AND moderation_review.id IS NULL
        AND report_dashboard.archived = FALSE
        AND report_dashboard.last_viewed_at <= :value:cutoff-date
        AND collection.type IS NULL
        AND (:value:embedding-on = 0 OR report_dashboard.enable_embedding = FALSE)
        AND (:value:public-sharing-on = 0 OR report_dashboard.public_uuid IS NULL)
        AND (report_dashboard.collection_id IN (:value*:collection-ids)
             OR (:value:include-null-collection = 1 AND report_dashboard.collection_id IS NULL))) stale
