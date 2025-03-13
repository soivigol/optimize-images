#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const imagemin = require('imagemin');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminSvgo = require('imagemin-svgo');
const imageminWebp = require('imagemin-webp');

// Add time tracking variables
const startTime = new Date();
const startTimeFormatted = startTime.toLocaleString();

// Function to format elapsed time in a human-readable format
function formatElapsedTime(startTime) {
  const elapsedMs = Date.now() - startTime.getTime();
  const seconds = Math.floor((elapsedMs / 1000) % 60);
  const minutes = Math.floor((elapsedMs / (1000 * 60)) % 60);
  const hours = Math.floor((elapsedMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  
  let timeString = '';
  if (days > 0) timeString += `${days}d `;
  if (hours > 0 || days > 0) timeString += `${hours}h `;
  if (minutes > 0 || hours > 0 || days > 0) timeString += `${minutes}m `;
  timeString += `${seconds}s`;
  
  return timeString;
}

const MAX_WIDTH = 2500;

// Supported image formats
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

async function processImage(imagePath) {
  try {
    const extension = path.extname(imagePath).toLowerCase();
    
    if (!IMAGE_EXTENSIONS.includes(extension)) {
      return;
    }
    
    console.log(`Processing: ${imagePath}`);
    
    // Get image metadata
    const metadata = await sharp(imagePath).metadata();
    
    // Skip if image width is already below the threshold
    if (metadata.width <= MAX_WIDTH) {
      console.log(`  - Width (${metadata.width}px) already <= ${MAX_WIDTH}px, optimizing only`);
    } else {
      console.log(`  - Resizing from ${metadata.width}px to ${MAX_WIDTH}px`);
    }
    
    // Create a temporary file path
    const tempPath = imagePath + '.temp';
    
    // Resize the image if needed, maintaining aspect ratio
    if (metadata.width > MAX_WIDTH) {
      await sharp(imagePath)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .toFile(tempPath);
      
      // Replace the original with the resized version
      fs.unlinkSync(imagePath);
      fs.renameSync(tempPath, imagePath);
    }
    
    // Optimize the image based on its format
    if (['.jpg', '.jpeg', '.png', '.gif', '.svg'].includes(extension)) {
      const originalSize = fs.statSync(imagePath).size;
      
      const plugins = [];
      
      if (['.jpg', '.jpeg'].includes(extension)) {
        plugins.push(imageminMozjpeg({ quality: 80 }));
      } else if (extension === '.png') {
        plugins.push(imageminPngquant({ quality: [0.65, 0.8] }));
      } else if (extension === '.gif') {
        plugins.push(imageminGifsicle());
      } else if (extension === '.svg') {
        plugins.push(imageminSvgo());
      } else if (extension === '.webp') {
        plugins.push(imageminWebp({ quality: 80 }));
      }
      
      if (plugins.length > 0) {
        const optimizedBuffer = await imagemin.buffer(fs.readFileSync(imagePath), {
          plugins
        });
        
        // Only write if optimization actually reduced the size
        if (optimizedBuffer.length < originalSize) {
          fs.writeFileSync(imagePath, optimizedBuffer);
          const newSize = fs.statSync(imagePath).size;
          const savedPercentage = ((originalSize - newSize) / originalSize * 100).toFixed(2);
          console.log(`  - Optimized: ${(originalSize / 1024).toFixed(2)}KB → ${(newSize / 1024).toFixed(2)}KB (${savedPercentage}% saved)`);
        } else {
          console.log(`  - Optimization did not reduce size, keeping original`);
        }
      }
    }
    
    console.log(`  - Completed processing ${imagePath}`);
  } catch (error) {
    console.error(`Error processing ${imagePath}: ${error.message}`);
  }
}

function getAllFilesIterative(dir) {
  const files = [];
  const queue = [dir];
  
  while (queue.length > 0) {
    const currentDir = queue.shift();
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentDir}:`, error.message);
      continue;
    }
  }
  
  return files;
}

async function findAndProcessImages() {
  try {
    console.log('Starting image processing...');
    console.log(`Start time: ${startTimeFormatted}`);
    console.log('Current directory:', process.cwd());
    
    // Get all image files using iterative approach
    const imageFiles = getAllFilesIterative('.');
    
    console.log(`Found ${imageFiles.length} image files to process`);
    
    // Process images in smaller batches of 10
    const batchSize = 10;
    let completed = 0;
    
    for (let i = 0; i < imageFiles.length; i += batchSize) {
      const batch = imageFiles.slice(i, i + batchSize);
      console.log(`\nProcessing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(imageFiles.length/batchSize)}`);
      
      // Process batch sequentially to avoid memory issues
      for (const imagePath of batch) {
        try {
          await processImage(imagePath);
          completed++;
          const percentComplete = Math.round(completed / imageFiles.length * 100);
          const elapsedTime = formatElapsedTime(startTime);
          
          // Display progress with elapsed time
          console.log(`Progress: ${completed}/${imageFiles.length} (${percentComplete}%) - Running for: ${elapsedTime}`);
          
          // Estimate completion time if we have enough data
          if (completed > 10 && percentComplete > 0) {
            const msPerImage = (Date.now() - startTime.getTime()) / completed;
            const remainingImages = imageFiles.length - completed;
            const msRemaining = msPerImage * remainingImages;
            
            // Only show ETA if we can make a reasonable estimate
            if (msRemaining > 0) {
              const etaDate = new Date(Date.now() + msRemaining);
              console.log(`Estimated completion: ${etaDate.toLocaleString()} (in approximately ${formatElapsedTime(new Date(Date.now() - msRemaining))})`);
            }
          }
        } catch (error) {
          console.error(`Failed to process ${imagePath}:`, error);
          // Continue with other images even if one fails
        }
      }
    }
    
    // Calculate final statistics
    const totalElapsedTime = formatElapsedTime(startTime);
    console.log(`\nAll images have been processed!`);
    console.log(`Total processing time: ${totalElapsedTime}`);
    console.log(`Started: ${startTimeFormatted}`);
    console.log(`Finished: ${new Date().toLocaleString()}`);
  } catch (error) {
    console.error(`Error finding or processing images:`, error);
    process.exit(1);
  }
}

// Execute the main function
findAndProcessImages().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
}); 