import debug from 'debug';
import { create } from '@actions/artifact';
import { getBooleanInput, getInput, setFailed, summary } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import {
  compatibilityTest,
  DockerConfig,
} from '@apollo/federation-subgraph-compatibility-tests';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main(): Promise<void> {
  const workingDirectory = getInput('workingDirectory');
  if (workingDirectory) {
    console.log(`changing current working directory to ${workingDirectory}`);
    const newWorkingDirectory = resolve(process.cwd(), workingDirectory);
    process.chdir(newWorkingDirectory);
  }

  const debugMode: boolean = getBooleanInput('debug');
  if (debugMode) {
    console.log('setting debug setting');
    debug.enable('debug,pm2,docker,rover,test');
  }

  const runtimeConfig: DockerConfig = {
    kind: 'docker',
    schemaFile: getInput('schema'),
    composeFile: getInput('compose'),
    path: getInput('path') ?? '',
    port: getInput('port') ?? '4001',
    format: 'markdown',
    failOnRequired: getBooleanInput('failOnRequired') ?? false,
    failOnWarning: getBooleanInput('failOnWarning') ?? false,
  };
  try {
    const successful = await compatibilityTest(runtimeConfig);

    // add empty log to separate logged results
    console.log('');
    const results = readFileSync('results.md', 'utf-8');

    const artifactPromise = uploadCompatibilityResultsArtifact();
    const jobSummaryPromise = commentOnJobSummary(results);
    const commentPromise = commentOnThePr(results);

    await Promise.all([artifactPromise, jobSummaryPromise, commentPromise]);
    if (!successful) {
      setFailed('Some compatibility tests did not complete successfully.');
    }
  } catch (error) {
    let message;
    if (error instanceof Error) {
      message = error.message;
    } else {
      message = String(error);
    }
    setFailed(message);
  }
}

async function uploadCompatibilityResultsArtifact() {
  logWithTimestamp(
    '***********************\nuploading compatibility results workflow artifact\n***********************',
  );
  const artifactClient = create();
  const artifactName = 'compatibility-results';
  const files = ['results.md'];
  const workingDirectory = resolve(process.cwd());
  const options = {
    continueOnError: false,
  };
  await artifactClient.uploadArtifact(
    artifactName,
    files,
    workingDirectory,
    options,
  );
}

async function commentOnJobSummary(results: string) {
  await summary
    .addHeading('Apollo Federation Subgraph Compatibility Results')
    .addCodeBlock(results)
    .write();
}

async function commentOnThePr(results: string) {
  const { pull_request } = context.payload;
  if (pull_request) {
    const token: string = getInput('token');
    logWithTimestamp(
      '***********************\nattempting to comment on the PR\n***********************',
    );
    if (token) {
      const octokit = getOctokit(token);
      // find latest comment
      const comments = await octokit.rest.issues.listComments({
        ...context.repo,
        issue_number: pull_request.number,
      });
      let lastCommentId: number | null = null;
      if (comments.status == 200 && comments.data) {
        const actionComment = comments.data.filter((element) =>
          element.body?.startsWith(
            '## Apollo Federation Subgraph Compatibility Results',
          ),
        );
        if (actionComment.length > 0) {
          lastCommentId = actionComment[0].id;
        }
      }

      const commentBody = `## Apollo Federation Subgraph Compatibility Results\n
${results}\n
Learn more:
* [Apollo Federation Subgraph Specification](https://www.apollographql.com/docs/federation/subgraph-spec/)
* [Compatibility Tests](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/COMPATIBILITY.md)
`;

      if (lastCommentId) {
        await octokit.rest.issues.updateComment({
          ...context.repo,
          comment_id: lastCommentId,
          body: commentBody,
        });
        logWithTimestamp('comment updated');
      } else {
        await octokit.rest.issues.createComment({
          ...context.repo,
          issue_number: pull_request.number,
          body: commentBody,
        });
        logWithTimestamp('comment posted');
      }
    } else {
      console.warn(
        new Date().toJSON(),
        'unable to post comment - Github Token was not provided',
      );
    }
  }
}

function logWithTimestamp(message: string) {
  console.log(new Date().toJSON(), message);
}

main().catch((error) => {
  console.error(error);
});
