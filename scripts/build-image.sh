#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="chatbot-app"
TAG="latest"
SAVE_PATH="chatbot-app.tar"
REGISTRY=""
PUSH=0

usage() {
  cat <<EOF
Usage: $0 [-i image] [-t tag] [-s save_path] [-r registry] [-p]
  -i image      Image name (default: chatbot-app)
  -t tag        Image tag (default: latest)
  -s save_path  Path to save tar (default: chatbot-app.tar)
  -r registry   Registry prefix (e.g. myregistry.example.com/myrepo)
  -p            Push to registry (requires -r)
EOF
  exit 1
}

while getopts ":i:t:s:r:ph" opt; do
  case "$opt" in
    i) IMAGE_NAME="$OPTARG" ;;
    t) TAG="$OPTARG" ;;
    s) SAVE_PATH="$OPTARG" ;;
    r) REGISTRY="$OPTARG" ;;
    p) PUSH=1 ;;
    h) usage ;;
    :) echo "Missing arg for -$OPTARG"; usage ;;
    \?) echo "Invalid option: -$OPTARG"; usage ;;
  esac
done

if [ -n "$REGISTRY" ]; then
  FULL_TAG="$REGISTRY/$IMAGE_NAME:$TAG"
else
  FULL_TAG="$IMAGE_NAME:$TAG"
fi

echo "Building image: $FULL_TAG"
docker build -t "$FULL_TAG" -f Dockerfile .

if [ $? -ne 0 ]; then
  echo "Docker build failed" >&2
  exit 1
fi

if [ "$PUSH" -eq 1 ]; then
  if [ -z "$REGISTRY" ]; then
    echo "Registry must be provided when using -p/--push" >&2
    exit 1
  fi
  echo "Pushing image: $FULL_TAG"
  docker push "$FULL_TAG"
  if [ $? -ne 0 ]; then
    echo "Docker push failed" >&2
    exit 1
  fi
fi

echo "Saving image to: $SAVE_PATH"
docker save -o "$SAVE_PATH" "$FULL_TAG"
if [ $? -ne 0 ]; then
  echo "Docker save failed" >&2
  exit 1
fi

echo "Done. Image: $FULL_TAG saved to $SAVE_PATH"
