#!/bin/bash
# Security Alerts Report Generator
# Generates a weekly markdown report of security alerts from GitHub
# - Open alerts: ALL (current security topography)
# - Fixed/Dismissed alerts: Since the specified date (default: 7 days ago)
#
# Usage:
#   bin/security-report.sh [YYYY-MM-DD] > report.md
#
# Examples:
#   bin/security-report.sh > security-report.md             # Last 7 days
#   bin/security-report.sh 2026-01-03 > security-report.md  # Since Jan 3, 2026

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-metabase/metabase}"
TODAY=$(date -u +%Y-%m-%d)

# Accept optional since_date parameter (YYYY-MM-DD), defaults to 7 days ago
if [[ -n "${1:-}" ]]; then
  # User provided a date, convert to ISO 8601 timestamp
  SINCE_DATE="${1}T00:00:00Z"
else
  # Default to 7 days ago
  SINCE_DATE=$(date -d "7 days ago" -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -v-7d -u +%Y-%m-%dT%H:%M:%SZ)
fi

# Map dismissed_reason to true positive / false positive
# Dependabot: not_used, inaccurate, auto_dismissed → false positive
# Dependabot: tolerable_risk, no_bandwidth, fix_started → true positive
# Code-scanning: false positive, used in tests → false positive
# Code-scanning: won't fix → true positive
map_dismissed_reason() {
  local reason="$1"

  case "$reason" in
    "not_used"|"inaccurate"|"auto_dismissed"|"false positive"|"used in tests")
      echo "false positive"
      ;;
    "tolerable_risk"|"no_bandwidth"|"fix_started"|"won't fix")
      echo "true positive"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

# Collect all alerts into temp files
OPEN_ALERTS=$(mktemp)
FIXED_ALERTS=$(mktemp)
DISMISSED_ALERTS=$(mktemp)

trap "rm -f $OPEN_ALERTS $FIXED_ALERTS $DISMISSED_ALERTS" EXIT

# Query Dependabot alerts
gh api "repos/$REPO/dependabot/alerts" --paginate -q '.[]' 2>/dev/null | while read -r alert; do
  state=$(echo "$alert" | jq -r '.state')
  updated_at=$(echo "$alert" | jq -r '.updated_at')
  cve=$(echo "$alert" | jq -r '.security_advisory.cve_id // .security_advisory.ghsa_id')
  summary=$(echo "$alert" | jq -r '.security_advisory.summary')
  html_url=$(echo "$alert" | jq -r '.html_url')
  created_at=$(echo "$alert" | jq -r '.created_at')
  dismissed_reason=$(echo "$alert" | jq -r '.dismissed_reason // empty')
  dismissed_comment=$(echo "$alert" | jq -r '.dismissed_comment // empty')

  # Calculate age in days for open alerts
  created_epoch=$(date -d "$created_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$created_at" +%s 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  age_days=$(( (now_epoch - created_epoch) / 86400 ))

  case "$state" in
    "open")
      # Open alerts: show ALL (no date filter)
      echo "- [$cve]($html_url): $summary: ${age_days} days old" >> "$OPEN_ALERTS"
      ;;
    "auto_dismissed")
      # Auto-dismissed: only since specified date
      if [[ "$updated_at" > "$SINCE_DATE" ]]; then
        tp_fp=$(map_dismissed_reason "auto_dismissed")
        desc="${dismissed_comment:-Auto-dismissed (dev dependency)}"
        echo "- [$cve]($html_url): $tp_fp: $desc" >> "$DISMISSED_ALERTS"
      fi
      ;;
    "fixed")
      # Fixed: only since specified date
      if [[ "$updated_at" > "$SINCE_DATE" ]]; then
        echo "- [$cve]($html_url): $summary" >> "$FIXED_ALERTS"
      fi
      ;;
    "dismissed")
      # Dismissed: only since specified date
      if [[ "$updated_at" > "$SINCE_DATE" ]]; then
        tp_fp=$(map_dismissed_reason "$dismissed_reason")
        desc="${dismissed_comment:-$dismissed_reason}"
        echo "- [$cve]($html_url): $tp_fp: $desc" >> "$DISMISSED_ALERTS"
      fi
      ;;
  esac
done

# Query Code-scanning alerts
gh api "repos/$REPO/code-scanning/alerts" --paginate -q '.[]' 2>/dev/null | while read -r alert; do
  state=$(echo "$alert" | jq -r '.state')
  updated_at=$(echo "$alert" | jq -r '.updated_at')
  rule_id=$(echo "$alert" | jq -r '.rule.id')
  rule_desc=$(echo "$alert" | jq -r '.rule.description')
  html_url=$(echo "$alert" | jq -r '.html_url')
  created_at=$(echo "$alert" | jq -r '.created_at')
  dismissed_reason=$(echo "$alert" | jq -r '.dismissed_reason // empty')
  dismissed_comment=$(echo "$alert" | jq -r '.dismissed_comment // empty')

  # Calculate age in days for open alerts
  created_epoch=$(date -d "$created_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$created_at" +%s 2>/dev/null || echo 0)
  now_epoch=$(date +%s)
  age_days=$(( (now_epoch - created_epoch) / 86400 ))

  case "$state" in
    "open")
      # Open alerts: show ALL (no date filter)
      echo "- [$rule_id]($html_url): $rule_desc: ${age_days} days old" >> "$OPEN_ALERTS"
      ;;
    "fixed")
      # Fixed: only since specified date
      if [[ "$updated_at" > "$SINCE_DATE" ]]; then
        echo "- [$rule_id]($html_url): $rule_desc" >> "$FIXED_ALERTS"
      fi
      ;;
    "dismissed")
      # Dismissed: only since specified date
      if [[ "$updated_at" > "$SINCE_DATE" ]]; then
        tp_fp=$(map_dismissed_reason "$dismissed_reason")
        desc="${dismissed_comment:-$dismissed_reason}"
        echo "- [$rule_id]($html_url): $tp_fp: $desc" >> "$DISMISSED_ALERTS"
      fi
      ;;
  esac
done

# Generate the markdown report
echo "# $TODAY"
echo ""

echo "## Open"
if [ -s "$OPEN_ALERTS" ]; then
  sort -r "$OPEN_ALERTS" | uniq
else
  echo "No open alerts"
fi
echo ""

echo "## Fixed"
if [ -s "$FIXED_ALERTS" ]; then
  sort -r "$FIXED_ALERTS" | uniq
else
  echo "No events in the selected period"
fi
echo ""

echo "## Dismissed"
if [ -s "$DISMISSED_ALERTS" ]; then
  sort -r "$DISMISSED_ALERTS" | uniq
else
  echo "No events in the selected period"
fi
