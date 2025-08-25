FROM python:3.11-slim

# Install system dependencies needed for psycopg2 (PostgreSQL driver)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install pandas and PostgreSQL database dependencies
RUN pip install --no-cache-dir \
    pandas==2.1.4 \
    sqlalchemy==2.0.23 \
    psycopg2==2.9.9

# Create non-root user for security
RUN useradd -m -u 1000 -s /bin/bash sandboxuser && \
    mkdir -p /sandbox/output && \
    chown -R sandboxuser:sandboxuser /sandbox

# Set working directory
WORKDIR /sandbox

# Switch to non-root user
USER sandboxuser

# Copy and set the entrypoint script
COPY --chown=sandboxuser:sandboxuser entrypoint.sh /sandbox/entrypoint.sh
RUN chmod +x /sandbox/entrypoint.sh

# Default environment variables
ENV OUTPUT_FILE=/sandbox/output/result.txt
ENV SCRIPT_FILE=/sandbox/script.py
ENV PYTHONUNBUFFERED=1

# Disable network access at runtime (must be enforced with --network none when running)
# Document this requirement
LABEL network="none"
LABEL security="Run with: docker run --network none --read-only --tmpfs /tmp --tmpfs /sandbox/output"

ENTRYPOINT ["/sandbox/entrypoint.sh"]