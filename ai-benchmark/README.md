# ai-benchmark

Benchmarks for the Metabase AI Agent, extracted from the [ai-service](https://github.com/metabase/ai-service) repository.

## Prerequisites

- Python 3.12+
- [Poetry](https://python-poetry.org/)
- [Git LFS](https://git-lfs.com/)
  — required for the benchmark database dump
- Docker (for running Metabase + Postgres)

## Setup

```bash
# Install Git LFS (if not already installed)
brew install git-lfs
git lfs install

# Clone
git clone https://github.com/metabase/ai-benchmark
cd ai-benchmark
git lfs pull

# Install dependencies
poetry install
```

## Running the Canonical Benchmark

```bash
# 1. Build the Docker base image (one time)
./scripts/build-base-image.sh

# 2. Start Metabase + Postgres
export MB_PREMIUM_EMBEDDING_TOKEN="your-token"
export MB_EE_EMBEDDING_SERVICE_API_KEY="your-key"
export MB_LLM_ANTHROPIC_API_KEY="your-key"
./scripts/start-metabase.sh canonical_benchmark

# 3. Run benchmarks (in another terminal)
# API keys for LLM-as-judge metrics (note the AI_SERVICE_ prefix)
export AI_SERVICE_ANTHROPIC_API_KEY="your-key"
export AI_SERVICE_OPEN_ROUTER_API_KEY="your-key"
poetry run python -m src.benchmarks.e2e \
  --sample 10 --seed 42
```

Results are saved to `./logs/<profile>__<timestamp>/`.
