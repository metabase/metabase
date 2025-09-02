FROM python:3.11-slim

WORKDIR /app

# Install Flask and dependencies
RUN pip install --no-cache-dir \
    flask==2.3.3 \
    pandas==2.1.4 \
    requests==2.31.0

# Create non-root user for security
RUN groupadd -r pyexec && \
    useradd -r -g pyexec pyexec && \
    mkdir -p /tmp/executions && \
    chown -R pyexec:pyexec /app /tmp/executions

COPY server.py transform_runner.py ./
RUN chown -R pyexec:pyexec /app
USER pyexec

ENV PYTHONUNBUFFERED=1

EXPOSE 5000

CMD ["python", "server.py"]
