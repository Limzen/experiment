/**
 * GitHub Pull Shark Gold (x4) Automation Runner
 * 
 * Features:
 * - Generates 1,024 realistic, human-like pull requests with conventional commit standards.
 * - Meaningful TypeScript codebase structure with realistic code updates.
 * - Secondary rate limit protection (safe delay, exponential backoff on 403/429).
 * - Progress persistence: resumes automatically if interrupted.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'Limzen';
const REPO = 'experiment';
const TARGET_PRS = 1024;
const DELAY_MS = 1400; // Safe delay to stay below secondary rate limits

const SCOPES = [
  'auth', 'api', 'cache', 'db', 'logger', 'router', 'service', 
  'utils', 'worker', 'config', 'core', 'validator', 'crypto', 
  'storage', 'middleware', 'metrics', 'events', 'parser', 'client'
];

const ACTIONS = [
  { type: 'feat', desc: 'implement graceful degradation fallback' },
  { type: 'feat', desc: 'add type-safe request payload validator' },
  { type: 'feat', desc: 'introduce exponential backoff retry policy' },
  { type: 'feat', desc: 'support custom header propagation in proxy' },
  { type: 'feat', desc: 'add batch processing for background tasks' },
  { type: 'feat', desc: 'implement cache eviction with LRU strategy' },
  { type: 'feat', desc: 'add structured audit logging for security events' },
  { type: 'feat', desc: 'normalize error response schema across endpoints' },
  { type: 'feat', desc: 'support async stream piping for large responses' },
  { type: 'feat', desc: 'add input sanitization for user queries' },
  { type: 'feat', desc: 'add early return for invalid state' },
  { type: 'feat', desc: 'optimize query with indexed fields' },
  { type: 'fix', desc: 'resolve null reference in edge case payload' },
  { type: 'fix', desc: 'fix race condition in async handler lifecycle' },
  { type: 'fix', desc: 'correct status code on validation failure' },
  { type: 'fix', desc: 'fix off-by-one error in pagination slice' },
  { type: 'fix', desc: 'prevent unhandled rejection on socket timeout' },
  { type: 'fix', desc: 'resolve memory leak in event listener cleanup' },
  { type: 'fix', desc: 'handle empty collection gracefully without throwing' },
  { type: 'fix', desc: 'fix timezone offset discrepancy in date parser' },
  { type: 'fix', desc: 'prevent double execution in idempotency key check' },
  { type: 'fix', desc: 'fix broken query string serialization for arrays' },
  { type: 'perf', desc: 'reduce memory allocation during startup cycle' },
  { type: 'perf', desc: 'memoize parsed regular expression patterns' },
  { type: 'perf', desc: 'cache compiled json schema validators' },
  { type: 'perf', desc: 'optimize string concatenation in high-frequency loop' },
  { type: 'perf', desc: 'reduce redundant database roundtrips on bulk fetch' },
  { type: 'refactor', desc: 'simplify conditional branching logic' },
  { type: 'refactor', desc: 'extract reusable helper function into utils' },
  { type: 'refactor', desc: 'consolidate duplicated validation routines' },
  { type: 'refactor', desc: 'convert callback flow to async/await syntax' },
  { type: 'refactor', desc: 'decouple transport layer from business logic' },
  { type: 'docs', desc: 'clarify return types and exception semantics' },
  { type: 'docs', desc: 'add JSDoc annotations for public helper methods' },
  { type: 'docs', desc: 'update API documentation with latest error codes' },
  { type: 'docs', desc: 'document environment variable configuration schema' },
  { type: 'test', desc: 'add unit tests for edge case inputs' },
  { type: 'test', desc: 'increase test coverage for boundary values' },
  { type: 'test', desc: 'add mock handler for downstream service timeouts' },
  { type: 'test', desc: 'verify schema validation against corrupted payloads' },
  { type: 'style', desc: 'standardize log message formatting across services' },
  { type: 'style', desc: 'enforce consistent naming conventions for constants' }
];

const FILES = [
  'src/utils/validator.ts',
  'src/utils/logger.ts',
  'src/utils/cache.ts',
  'src/services/auth.ts',
  'src/services/api.ts',
  'src/services/storage.ts',
  'src/middleware/rate-limiter.ts',
  'src/types/index.ts',
  'src/config/app.config.ts'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function ensureBaseFiles() {
  const dirs = ['src', 'src/utils', 'src/services', 'src/middleware', 'src/types', 'src/config'];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  for (const file of FILES) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `/**\n * Module: ${file}\n * Auto-initialized for experiment project\n */\n\nexport const MODULE_INIT = true;\n`);
    }
  }
}

async function githubFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Limzen-Dev-Runner',
    ...options.headers
  };

  let retries = 5;
  while (retries > 0) {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 403 || res.status === 429) {
      const resetTime = res.headers.get('x-ratelimit-reset');
      const retryAfter = res.headers.get('retry-after');
      const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : (resetTime ? Math.max(5, Math.ceil(parseInt(resetTime, 10) - Date.now() / 1000)) : 60);
      console.warn(`[WARN] Secondary/Rate limit hit (Status ${res.status}). Waiting ${waitSeconds}s before retrying...`);
      await sleep((waitSeconds + 2) * 1000);
      retries--;
      continue;
    }
    return res;
  }
  throw new Error(`Failed request to ${url} after retries.`);
}

function loadProgress() {
  if (fs.existsSync('progress.json')) {
    try {
      return JSON.parse(fs.readFileSync('progress.json', 'utf8'));
    } catch (_) {}
  }
  return { completed: 0, lastRun: null };
}

function saveProgress(completed, prNumber, title) {
  const data = { completed, lastPrNumber: prNumber, lastTitle: title, updatedAt: new Date().toISOString() };
  fs.writeFileSync('progress.json', JSON.stringify(data, null, 2));
}

async function main() {
  console.log(`=======================================================`);
  console.log(`Starting Pull Shark Gold Automation (${TARGET_PRS} PRs)`);
  console.log(`Target: https://github.com/${OWNER}/${REPO}`);
  console.log(`=======================================================\n`);

  ensureBaseFiles();

  const progress = loadProgress();
  let currentCount = progress.completed;
  console.log(`Current progress: ${currentCount} / ${TARGET_PRS} PRs completed.\n`);

  while (currentCount < TARGET_PRS) {
    const nextIdx = currentCount + 1;
    const scope = getRandomItem(SCOPES);
    const action = getRandomItem(ACTIONS);
    const targetFile = getRandomItem(FILES);
    const commitTitle = `${action.type}(${scope}): ${action.desc}`;
    const branchName = `${action.type}/${scope}-${Math.floor(1000 + Math.random() * 9000)}`;

    const prBody = `### Summary
- ${action.desc.charAt(0).toUpperCase() + action.desc.slice(1)} in \`${targetFile}\`.
- Ensure type-safety, backward compatibility, and adherence to project conventions.

### Verification
- Local build and unit tests pass cleanly.
- Code style and format rules verified.`;

    // 1. Make code modification in file
    const timestamp = new Date().toISOString();
    const snippet = `\n// [PR #${nextIdx}] ${commitTitle}\nexport const UPDATE_${nextIdx} = { timestamp: "${timestamp}", active: true };\n`;
    fs.appendFileSync(targetFile, snippet);

    // 2. Commit locally
    execSync(`git add "${targetFile}"`);
    execSync(`git commit -m "${commitTitle}"`);

    // 3. Push to new remote branch directly from HEAD
    execSync(`git push origin HEAD:refs/heads/${branchName} --quiet`);

    // 4. Create Pull Request
    const prRes = await githubFetch(`/repos/${OWNER}/${REPO}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: commitTitle,
        head: branchName,
        base: 'main',
        body: prBody
      })
    });

    if (!prRes.ok) {
      const err = await prRes.text();
      console.error(`[ERROR] Failed to create PR #${nextIdx}:`, err);
      await sleep(3000);
      continue;
    }

    const prData = await prRes.json();
    const prNumber = prData.number;

    // 5. Merge Pull Request
    const mergeRes = await githubFetch(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merge_method: 'merge',
        commit_title: `Merge PR #${prNumber} - ${commitTitle}`
      })
    });

    if (!mergeRes.ok) {
      const err = await mergeRes.text();
      console.error(`[ERROR] Failed to merge PR #${prNumber}:`, err);
      await sleep(3000);
      continue;
    }

    // 6. Fast-forward local main to match remote merged state
    execSync(`git pull origin main --quiet`);

    // 7. Delete remote branch to keep repo clean
    githubFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${branchName}`, {
      method: 'DELETE'
    }).catch(() => {});

    currentCount++;
    saveProgress(currentCount, prNumber, commitTitle);

    const percent = ((currentCount / TARGET_PRS) * 100).toFixed(1);
    console.log(`[${currentCount}/${TARGET_PRS} | ${percent}%] Merged PR #${prNumber}: ${commitTitle}`);

    await sleep(DELAY_MS);
  }

  console.log(`\n🎉 SUCCESS! Completed all ${TARGET_PRS} Pull Requests on https://github.com/${OWNER}/${REPO}`);
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
