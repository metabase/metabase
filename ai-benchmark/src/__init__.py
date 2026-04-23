"""AI Benchmark Framework.

This package provides infrastructure for evaluating AI agent performance
through end-to-end benchmarks against live Metabase instances.
"""

import logging
import os

# Use local litellm model cost map to avoid 20s GitHub fetch delay
# Set this early before any litellm imports happen anywhere in the application
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")

# Suppress noisy LiteLLM info logs
logging.getLogger("LiteLLM").setLevel(logging.WARNING)
