import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TestUser } from '../types';

export function generateSeed(count: number, outputPath: string) {
  const users: TestUser[] = [];
  const accessibleUsers: any[] = [];
  
  for (let i = 1; i <= count; i++) {
    const paddedId = String(i).padStart(4, '0');
    const testId = `k6user${paddedId}`;
    const ip = `10.0.0.${(i % 254) + 1}`;
    
    users.push({
      testId,
      ip,
      deviceUuid: uuidv4(),
      aesKey: require('crypto').randomBytes(32).toString('hex'),
    });

    accessibleUsers.push({
      id: testId,
      name: `K6 Load Test User ${i}`,
      ip
    });
  }

  // Load sample config template
  const templatePath = path.resolve('/Users/justinchen/Desktop/sample/config.json');
  let examConfig: any = {};
  if (fs.existsSync(templatePath)) {
    examConfig = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  } else {
    // Fallback if template doesn't exist
    examConfig = {
      testTitle: "K6 Load Test",
      description: "Auto-generated config",
      judgerSettings: { timeLimit: 1000, memoryLimit: 25600000 },
      puzzles: []
    };
  }

  // Migrate legacy puzzles to 4 sections
  if (examConfig.puzzles && Array.isArray(examConfig.puzzles)) {
    const allPuzzles = examConfig.puzzles;
    const sections: any[] = [];
    const sectionCount = 4;
    const puzzlesPerSection = Math.ceil(allPuzzles.length / sectionCount);

    let puzzleIndex = 1;
    for (let s = 0; s < sectionCount; s++) {
      const sectionPuzzles = allPuzzles.slice(s * puzzlesPerSection, (s + 1) * puzzlesPerSection);
      if (sectionPuzzles.length > 0) {
        let sumPuzzles = 0;
        // Ensure all puzzles and subtasks have required fields for the backend schema
        sectionPuzzles.forEach((puzzle: any) => {
          if (!puzzle.id || String(puzzle.id).trim() === '') puzzle.id = `q${puzzleIndex++}`;
          if (puzzle.score === undefined) puzzle.score = 100;
          sumPuzzles += puzzle.score;

          if (puzzle.subtasks && Array.isArray(puzzle.subtasks)) {
            let sumSubtasks = 0;
            puzzle.subtasks.forEach((sub: any) => {
              if (sub.score === undefined) sub.score = Math.floor(puzzle.score / puzzle.subtasks.length);
              sumSubtasks += sub.score;
            });
            // Fix rounding error on last subtask to ensure it perfectly matches puzzle.score
            if (sumSubtasks !== puzzle.score && puzzle.subtasks.length > 0) {
              puzzle.subtasks[puzzle.subtasks.length - 1].score += (puzzle.score - sumSubtasks);
            }
          }
        });

        sections.push({
          id: `section-${s + 1}`,
          title: `Section ${s + 1}`,
          description: `Auto-generated section ${s + 1}`,
          maxScore: sumPuzzles,
          puzzles: sectionPuzzles
        });
      }
    }
    
    examConfig.sections = sections;
    delete examConfig.puzzles;
  }

  // Overwrite accessibleUsers
  examConfig.accessibleUsers = accessibleUsers;
  // Inject k6 specific data for the Master node
  examConfig.k6TestUsers = users;

  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(examConfig, null, 2));
  console.log(`Successfully generated ExamConfig with ${count} users into ${outputPath}`);
}
