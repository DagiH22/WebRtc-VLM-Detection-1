#!/bin/bash
set -e
DURATION=${1:-30}

echo "🚀 Running bench for $DURATION seconds..."
sleep $DURATION

node bench/collect_metrics.js $DURATION
